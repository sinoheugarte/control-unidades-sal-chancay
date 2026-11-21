// Exportación a HTML y enlaces para compartir (SharePoint) de cualquier pantalla o sección.
// También decora los botones de exportación con íconos representativos (Excel, PDF, HTML, enlace).
import { state, esc, toast, modal, descargarBlob } from './core.js?v=__V__';
import * as G from './graph.js?v=__V__';

const SVG = (inner, vb = '0 0 24 24') => `<svg class="fx-ico" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
export const ICO = {
  xls: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#16a34a"/><path d="M8 7l8 10M16 7L8 17" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'),
  pdf: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#dc2626"/><text x="12" y="15.6" text-anchor="middle" font-size="7.6" font-weight="800" font-family="Inter,Arial,sans-serif" fill="#fff">PDF</text>'),
  html: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#ea580c"/><path d="M9.5 8.5 6 12l3.5 3.5M14.5 8.5 18 12l-3.5 3.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  link: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#2563eb"/><path d="M10.5 13.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.6.6M13.5 10.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.6-.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};

let cssApp = null;
async function cssTexto() {
  if (cssApp !== null) return cssApp;
  try { cssApp = await (await fetch(document.querySelector('link[href*="css/app.css"]').href)).text(); } catch { cssApp = ''; }
  return cssApp;
}
const ahora = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const opNombre = () => { const o = state.ops.find((x) => x.id === state.opId); return o ? `${o.nave} · Orden ${o.orden}` : ''; };
const archivoSeguro = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ·.]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Genera un HTML autónomo (estilos incluidos, gráficos como imágenes) del elemento indicado. */
export async function htmlDe(el, titulo) {
  const copia = el.cloneNode(true);
  // Gráficos → imágenes
  const orig = [...el.querySelectorAll('canvas')];
  [...copia.querySelectorAll('canvas')].forEach((c, i) => {
    const img = document.createElement('img');
    try { img.src = orig[i].toDataURL('image/png'); } catch { /* */ }
    img.style.cssText = 'width:100%;height:100%;object-fit:contain';
    c.replaceWith(img);
  });
  // Fuera: controles, barras de filtros, filas ocultas por el filtro
  copia.querySelectorAll('button, .btn, .tbar, tr.tfil, .no-print, input[type=file], dialog, [data-fx]').forEach((x) => x.remove());
  copia.querySelectorAll('tr[hidden]').forEach((x) => x.remove());
  copia.querySelectorAll('input, select, textarea').forEach((x) => {
    const s = document.createElement('span');
    s.textContent = x.tagName === 'SELECT' ? (x.selectedOptions[0]?.textContent || '') : x.value;
    x.replaceWith(s);
  });
  copia.querySelectorAll('.table-wrap').forEach((x) => { x.style.maxHeight = 'none'; });
  copia.classList.remove('sale', 'entra', 'atras');
  const tema = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const css = await cssTexto();
  const empresa = 'PACIFICO DESPACHOS S.A.C.';
  const html = `<!doctype html><html lang="es" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}${opNombre() ? ` · ${esc(opNombre())}` : ''}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${css}
body{padding:0}.rep{max-width:1500px;margin:0 auto;padding:22px}.rep-h{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px 18px;border-radius:16px;background:var(--grad);color:#fff;box-shadow:var(--shadow-lg)}
.rep-h h1{font-size:20px}.rep-h small{display:block;opacity:.85;font-weight:500}.rep-f{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
.content{padding:0}.content>*,.dbar::before,.bar>i{animation:none!important}</style></head>
<body><div class="rep"><div class="rep-h"><div><h1>${esc(titulo)}</h1><small>${esc(empresa)}${opNombre() ? ` · ${esc(opNombre())}` : ''} · Generado ${ahora()}</small></div></div>
<div class="content">${copia.classList.contains('content') ? copia.innerHTML : copia.outerHTML}</div>
<div class="rep-f">Control de Unidades · Despacho · Acopio · Embarque — reporte de solo lectura</div></div></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

const nombreArchivo = (titulo) => archivoSeguro(`${titulo}${opNombre() ? ` - ${opNombre().replace(' · ', ' - ')}` : ''}`) || 'reporte';

export async function descargarHTML(el, titulo) {
  try { descargarBlob(await htmlDe(el, titulo), `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
}

/** Guarda el HTML en SharePoint, crea un enlace de solo lectura y permite enviarlo por correo. */
export async function compartir(el, titulo) {
  if (state.user?.rol === 'transportista') { toast('Descargue el HTML y compártalo como archivo.', true); return; }
  toast('Generando el enlace para compartir…');
  let url;
  try {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    const ruta = `Compartidos/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())} ${nombreArchivo(titulo)}.html`;
    await G.subirArchivo(ruta, await htmlDe(el, titulo), 'text/html');
    url = await G.crearEnlace(ruta);
  } catch (e) { toast(`No se pudo crear el enlace: ${e.message}`, true); return; }
  const asunto = `${titulo}${opNombre() ? ` · ${opNombre()}` : ''}`;
  const dlg = modal({
    title: 'Compartir reporte', submitText: 'Enviar por correo', wide: true,
    body: `<p style="margin-top:0">Se guardó <strong>${esc(titulo)}</strong> en SharePoint (<em>Control Unidades Sal/Compartidos</em>).
      El enlace es de <strong>solo lectura</strong> y lo pueden abrir los usuarios de su organización.</p>
      <div class="btns" style="flex-wrap:nowrap"><input id="fx-url" readonly value="${esc(url)}" style="flex:1"><button type="button" class="btn" id="fx-copiar">Copiar enlace</button>
      <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div>
      <div class="form" style="margin-top:14px">
        <label class="full">Para (correos separados por coma)<input name="para" placeholder="usuario@empresa.com, otro@empresa.com"></label>
        <label class="full">Mensaje (opcional)<textarea name="mensaje" rows="3">Comparto el reporte "${esc(asunto)}".</textarea></label>
      </div>`,
    onSubmit: async (f) => {
      const para = String(f.para || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
      if (!para.length) throw new Error('Ingrese al menos un correo');
      const cuerpo = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#17212f"><p>${esc(f.mensaje || '').replace(/\n/g, '<br>')}</p>
        <p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Ver reporte</a></p>
        <p style="color:#5b6b80;font-size:12px">${esc(asunto)} · Control de Unidades · ${esc(state.user?.nombre || '')}</p></div>`;
      try {
        await G.asegurarPermisoCorreo();
        await G.enviarCorreo({ para, asunto, html: cuerpo });
        toast(`Enlace enviado a ${para.join(', ')}`);
      } catch (e) {
        location.href = `mailto:${para.join(',')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(`${f.mensaje || ''}\n\n${url}`)}`;
        toast(`Se abrió su programa de correo (${e.message})`, true);
      }
    },
  });
  dlg.querySelector('#fx-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { dlg.querySelector('#fx-url').select(); document.execCommand('copy'); toast('Enlace copiado'); }
  });
}

/* ---------- Decoración automática de los botones de exportación ---------- */
const tituloDe = (scope) => scope.querySelector('h2, h3')?.textContent.trim() || document.querySelector('#titulo')?.textContent.trim() || 'Reporte';
function decorar(b) {
  b.dataset.fxd = '1';
  const t = b.textContent.trim();
  const tipo = /\bExcel\b|\bXLSX?\b/i.test(t) ? 'xls' : /\bPDF\b/.test(t) ? 'pdf' : null;
  if (!tipo) return;
  b.classList.add('fx', `fx-${tipo}`);
  b.insertAdjacentHTML('afterbegin', ICO[tipo]);
  b.title = b.title || `Descargar en ${tipo === 'xls' ? 'Excel' : 'PDF'}`;
  // Junto a cada PDF: HTML y enlace para compartir (de la sección donde está el botón)
  if (tipo === 'pdf' && !b.closest('dialog, td, .fx-sin-html') && !b.parentElement.querySelector('[data-fx]')) {
    const scope = () => b.closest('.card') || document.getElementById('view');
    const h = document.createElement('button');
    h.type = 'button'; h.className = `btn fx fx-html${b.classList.contains('sm') ? ' sm' : ''}`; h.dataset.fx = 'html';
    h.innerHTML = `${ICO.html}HTML`; h.title = 'Descargar como página HTML';
    h.addEventListener('click', () => descargarHTML(scope(), tituloDe(scope())));
    const l = document.createElement('button');
    l.type = 'button'; l.className = `btn fx fx-link${b.classList.contains('sm') ? ' sm' : ''}`; l.dataset.fx = 'link';
    l.innerHTML = `${ICO.link}Compartir`; l.title = 'Crear un enlace para compartir por correo';
    l.addEventListener('click', () => compartir(scope(), tituloDe(scope())));
    b.after(h, l);
    if (state.user?.rol === 'transportista') l.remove();
  }
}
export function activarExportes(root = document.body) {
  const scan = () => root.querySelectorAll('.btn:not([data-fxd]):not([data-fx])').forEach(decorar);
  scan();
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; scan(); }); }).observe(root, { childList: true, subtree: true });
}
