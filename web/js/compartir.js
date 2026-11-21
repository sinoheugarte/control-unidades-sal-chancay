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
/** HTML limpio (sin controles, gráficos como imágenes) de un elemento de la pantalla. */
export function fragmentoDe(el) {
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
  // Controles: sólo se muestran los filtros que están aplicados
  const origCtl = [...el.querySelectorAll('input, select, textarea')];
  [...copia.querySelectorAll('input, select, textarea')].forEach((x, i) => {
    const o = origCtl[i] || x;
    const val = o.tagName === 'SELECT' ? (o.value ? o.selectedOptions[0]?.textContent : '') : (o.type === 'checkbox' || o.type === 'radio' || o.type === 'hidden' ? '' : o.value);
    if (!val) { x.remove(); return; }
    const s = document.createElement('span');
    s.className = 'filtro-act'; s.textContent = `Filtro: ${val}`;
    x.replaceWith(s);
  });
  copia.querySelectorAll('.table-wrap').forEach((x) => { x.style.maxHeight = 'none'; });
  copia.classList.remove('sale', 'entra', 'atras');
  return copia.classList.contains('content') ? copia.innerHTML : copia.outerHTML;
}

/** Documento HTML autónomo con una o varias secciones (pestañas de la app), con índice para saltar entre ellas. */
export async function documento(titulo, secciones) {
  const tema = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const css = await cssTexto();
  const empresa = 'PACIFICO DESPACHOS S.A.C.';
  const html = `<!doctype html><html lang="es" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}${opNombre() ? ` · ${esc(opNombre())}` : ''}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${css}
html,body{overflow-x:auto}body{padding:0;min-width:0}.rep{max-width:none;margin:0;padding:18px 20px}
*,*::before,*::after{animation:none!important;transition:none!important}
.content>*,.card,.kpi,.ficha{opacity:1!important;transform:none!important;filter:none!important}
.table-wrap{max-height:82vh!important;overflow:auto!important}
.filtro-act{display:inline-flex;gap:4px;padding:3px 9px;border-radius:99px;background:var(--primary-soft);color:var(--primary);font-size:12px;font-weight:650;margin-right:6px}
.chart-box img{display:block}.rep-h{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px 18px;border-radius:16px;background:var(--grad);color:#fff;box-shadow:var(--shadow-lg)}
.rep-h h1{font-size:20px}.rep-h small{display:block;opacity:.85;font-weight:500}.rep-f{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
.content{padding:0}.content>*,.dbar::before,.bar>i{animation:none!important}
.rep-nav{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:6px;padding:8px;margin:0 0 14px;border-radius:14px;background:color-mix(in srgb,var(--surface) 85%,transparent);backdrop-filter:blur(12px);box-shadow:var(--shadow)}
.rep-nav a{padding:6px 12px;border-radius:9px;font-weight:650;font-size:12.5px;text-decoration:none;color:var(--text);background:var(--surface-2)}
.rep-nav a:hover{background:var(--primary-soft);color:var(--primary)}
.rep-sec{scroll-margin-top:70px;margin-bottom:26px}.rep-st{font-size:17px;margin:4px 0 12px;padding-left:10px;border-left:4px solid var(--primary)}</style></head>
<body><div class="rep"><div class="rep-h"><div><h1>${esc(titulo)}</h1><small>${esc(empresa)}${opNombre() ? ` · ${esc(opNombre())}` : ''} · Generado ${ahora()}</small></div></div>
${secciones.length > 1 ? `<nav class="rep-nav">${secciones.map((x, i) => `<a href="#s${i + 1}">${esc(x.titulo)}</a>`).join('')}</nav>` : ''}
${secciones.map((x, i) => `<section id="s${i + 1}" class="rep-sec">${secciones.length > 1 ? `<h2 class="rep-st">${esc(x.titulo)}</h2>` : ''}<div class="content">${x.html}</div></section>`).join('')}
<div class="rep-f">Control de Unidades · Despacho · Acopio · Embarque — reporte de solo lectura</div></div></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export async function htmlDe(el, titulo) { return documento(titulo, [{ titulo, html: fragmentoDe(el) }]); }

const nombreArchivo = (titulo) => archivoSeguro(`${titulo}${opNombre() ? ` - ${opNombre().replace(' · ', ' - ')}` : ''}`) || 'reporte';

export async function descargarHTML(el, titulo) {
  try { descargarBlob(await htmlDe(el, titulo), `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
}

/** Guarda el HTML en SharePoint, crea un enlace de solo lectura y permite enviarlo por correo. */
export async function compartir(el, titulo) { return compartirBlob(() => htmlDe(el, titulo), titulo); }
export async function compartirBlob(generar, titulo) {
  if (state.user?.rol === 'transportista') { toast('Descargue el HTML y compártalo como archivo.', true); return; }
  toast('Generando el enlace para compartir…');
  let url, urlSp;
  try {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    const ruta = `Compartidos/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())} ${nombreArchivo(titulo)}.html`;
    await G.subirArchivo(ruta, await generar(), 'text/html');
    // El enlace abre el reporte dentro de la app (SharePoint no muestra páginas HTML; sólo las descarga)
    url = `${G.appUrl()}#/ver?f=${encodeURIComponent(ruta)}`;
    try { urlSp = await G.crearEnlace(ruta); } catch { urlSp = null; }
  } catch (e) { toast(`No se pudo crear el enlace: ${e.message}`, true); return; }
  const asunto = `${titulo}${opNombre() ? ` · ${opNombre()}` : ''}`;
  const dlg = modal({
    title: 'Compartir reporte', submitText: 'Enviar por correo', wide: true,
    body: `<p style="margin-top:0">Se guardó <strong>${esc(titulo)}</strong> en SharePoint (<em>Control Unidades Sal/Compartidos</em>).
      El enlace abre el reporte en la aplicación, en <strong>solo lectura</strong>; quien lo reciba ingresa con su cuenta de Microsoft 365 de la organización.
      ${urlSp ? `<br><span class="muted small">Archivo en SharePoint (para descargarlo): <a href="${esc(urlSp)}" target="_blank" rel="noopener">abrir</a></span>` : ''}</p>
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
    const scope = () => { const c = b.closest('.card'); return c && c.querySelector('table, canvas, .kpi, .fichas, .vlista') ? c : document.getElementById('view'); };
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

/** Pantalla "Reporte compartido": muestra dentro de la app el HTML guardado en SharePoint. */
export async function vVer(view) {
  const f = new URLSearchParams(location.hash.split('?')[1] || '').get('f');
  if (!f || !/^Compartidos\/[^/]+\.html$/.test(f)) { view.innerHTML = '<div class="alert bad">Enlace de reporte no válido.</div>'; return; }
  const { texto, webUrl } = await G.leerTexto(f);
  const nombre = f.split('/').pop().replace(/^\d{8}-\d{6}\s*/, '').replace(/\.html$/, '');
  view.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div class="card-h" style="padding:12px 16px;margin:0;border-bottom:1px solid var(--border)">
      <div><h2>${esc(nombre)}</h2><div class="muted small">Reporte compartido · solo lectura</div></div>
      <div class="btns"><button class="btn sm fx" id="v-desc" data-fx="html">${ICO.html}Descargar HTML</button>
      <button class="btn sm" id="v-nueva">Abrir en otra pestaña</button>${webUrl ? `<a class="btn sm" href="${esc(webUrl)}" target="_blank" rel="noopener">SharePoint</a>` : ''}</div></div>
    <iframe id="v-frame" title="${esc(nombre)}" sandbox="allow-same-origin allow-popups" style="display:block;width:100%;height:calc(100vh - 150px);border:0;background:var(--bg)"></iframe></div>`;
  view.querySelector('#v-frame').srcdoc = texto;
  const blob = () => new Blob([texto], { type: 'text/html;charset=utf-8' });
  view.querySelector('#v-desc').onclick = () => descargarBlob(blob(), `${nombre}.html`);
  view.querySelector('#v-nueva').onclick = () => { const u = URL.createObjectURL(blob()); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); };
}

/**
 * Selector de pestañas para exportar o compartir varias a la vez.
 * rutas: [{ k, t }], actual: clave de la pantalla abierta, capturar(keys) → [{ titulo, html }]
 */
export function elegirPantallas({ rutas, actual, capturar, accion = 'compartir' }) {
  const dlg = modal({
    title: accion === 'compartir' ? 'Compartir reporte' : 'Descargar reporte HTML', wide: true,
    submitText: accion === 'compartir' ? 'Crear enlace' : 'Descargar HTML',
    body: `<p class="muted" style="margin-top:0">Elija las pestañas que se incluirán. Se genera un solo reporte con un índice para pasar de una a otra${opNombre() ? `, con los datos de <strong>${esc(opNombre())}</strong>` : ''}.</p>
      <div class="btns" style="margin-bottom:10px"><button type="button" class="btn sm" data-todas>Seleccionar todas</button><button type="button" class="btn sm" data-ninguna>Quitar todas</button></div>
      <div class="pant-sel">${rutas.map((r) => `<label class="pant"><input type="checkbox" name="r:${r.k}" ${r.k === actual ? 'checked' : ''}>
        <span class="ico" style="--c:${r.c || '#2563eb'}">${r.ico || ''}</span><span>${esc(r.t)}</span></label>`).join('')}</div>`,
    onSubmit: async (f) => {
      const keys = rutas.map((r) => r.k).filter((k) => f[`r:${k}`]);
      if (!keys.length) throw new Error('Seleccione al menos una pestaña');
      const titulo = keys.length === 1 ? rutas.find((r) => r.k === keys[0]).t : 'Reporte de la operación';
      const generar = async () => documento(titulo, await capturar(keys));
      if (accion === 'compartir') setTimeout(() => compartirBlob(generar, titulo), 0);
      else {
        try { const blob = await generar(); descargarBlob(blob, `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
      }
    },
  });
  dlg.querySelector('[data-todas]').onclick = () => dlg.querySelectorAll('.pant input').forEach((x) => { x.checked = true; });
  dlg.querySelector('[data-ninguna]').onclick = () => dlg.querySelectorAll('.pant input').forEach((x) => { x.checked = false; });
}
