// Exportación a HTML y enlaces para compartir (SharePoint) de cualquier pantalla o sección.
// También decora los botones de exportación con íconos representativos (Excel, PDF, HTML, enlace).
import { state, esc, toast, modal, descargarBlob, esNativa } from './core.js?v=__V__';
const aBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
import * as G from './graph.js?v=__V__';

const SVG = (inner, vb = '0 0 24 24') => `<svg class="fx-ico" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
const ICO_WA = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path fill="#fff" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>';
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
  // Fuera: formularios de edición (p. ej. parámetros), controles, barras de filtros, filas ocultas por el filtro
  copia.querySelectorAll('form').forEach((f) => { const c = f.closest('.card'); (c && c !== copia ? c : f).remove(); });
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
.rep-sec{margin-bottom:26px}.rep-st{font-size:17px;margin:4px 0 12px;padding-left:10px;border-left:4px solid var(--c,var(--primary));display:flex;align-items:center;gap:10px}
/* Varias pestañas: menú lateral; se muestra sólo la pestaña elegida (sin scripts, con :target) */
.rep-cuerpo{display:grid;grid-template-columns:236px minmax(0,1fr);gap:18px;align-items:start}
.rep-lat{position:sticky;top:12px;display:grid;gap:4px;padding:10px;border-radius:16px;background:linear-gradient(180deg,var(--side-2),var(--side));box-shadow:var(--shadow-lg)}
.rep-lat .sep{margin:2px 8px 6px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--side-ink);opacity:.6}
.rep-lat a{display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:11px;color:var(--side-ink);text-decoration:none;font-weight:600;position:relative}
.rep-lat a:hover{background:var(--side-active);color:#fff}
.rep-lat .ico,.rep-st .ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:#fff;background:linear-gradient(145deg,var(--c),color-mix(in srgb,var(--c) 75%,#000));box-shadow:0 4px 10px -3px color-mix(in srgb,var(--c) 70%,transparent)}
.rep-lat .ico svg,.rep-st .ico svg{width:17px;height:17px}
.rep-tabs .rep-sec{display:none}.rep-tabs .rep-sec:target{display:block}
.rep-tabs:not(:has(.rep-sec:target)) .rep-sec:first-of-type{display:block}
@media(max-width:900px){.rep-cuerpo{grid-template-columns:1fr}.rep-lat{position:static;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}}
@media print{.rep-lat{display:none}.rep-cuerpo{display:block}.rep-tabs .rep-sec{display:block!important}}
${secciones.length > 1 ? secciones.map((x, i) => `.rep-cuerpo:has(#s${i + 1}:target) .rep-lat a[href="#s${i + 1}"]${i === 0 ? `,.rep-cuerpo:not(:has(.rep-sec:target)) .rep-lat a[href="#s1"]` : ''}{background:var(--side-active);color:#fff;box-shadow:inset 3px 0 0 var(--c)}`).join('\n') : ''}</style></head>
<body><div class="rep"><div class="rep-h"><div><h1>${esc(titulo)}</h1><small>${esc(empresa)}${opNombre() ? ` · ${esc(opNombre())}` : ''} · Generado ${ahora()}</small></div></div>
${secciones.length > 1 ? `<div class="rep-cuerpo">
  <nav class="rep-lat" aria-label="Pestañas compartidas"><div class="sep">Pestañas compartidas</div>${secciones.map((x, i) => `<a href="#s${i + 1}" style="--c:${x.c || '#2563eb'}"><span class="ico">${x.ico || ''}</span><span>${esc(x.titulo)}</span></a>`).join('')}</nav>
  <div class="rep-tabs">${secciones.map((x, i) => `<section id="s${i + 1}" class="rep-sec" style="--c:${x.c || '#2563eb'}"><h2 class="rep-st"><span class="ico">${x.ico || ''}</span>${esc(x.titulo)}</h2><div class="content">${x.html}</div></section>`).join('')}</div>
</div>` : secciones.map((x) => `<section class="rep-sec"><div class="content">${x.html}</div></section>`).join('')}
<div class="rep-f">Control de Unidades · Despacho · Acopio · Embarque — reporte de solo lectura</div></div></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export async function htmlDe(el, titulo) { return documento(titulo, [{ titulo, html: fragmentoDe(el) }]); }

const nombreArchivo = (titulo) => archivoSeguro(`${titulo}${opNombre() ? ` - ${opNombre().replace(' · ', ' - ')}` : ''}`) || 'reporte';

export async function descargarHTML(el, titulo) {
  try { descargarBlob(await htmlDe(el, titulo), `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
}

/** Comparte un reporte de dos formas:
    - Enlace (usuarios de la organización): se guarda en SharePoint y se abre en la app con la cuenta Microsoft.
    - Archivo (invitados sin cuenta Microsoft): se envía el HTML del reporte, que se abre en cualquier navegador. */
export async function compartir(el, titulo) { return compartirBlob(() => htmlDe(el, titulo), titulo); }
export async function compartirBlob(generar, titulo) {
  const soloArchivo = state.user?.rol === 'transportista';
  let blob;
  try { blob = await generar(); } catch (e) { toast(`No se pudo generar el reporte: ${e.message}`, true); return; }
  const nombre = `${nombreArchivo(titulo)}.html`;
  const kb = Math.max(1, Math.round(blob.size / 1024));
  const tam = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  const asunto = `${titulo}${opNombre() ? ` · ${opNombre()}` : ''}`;
  let url = null, urlSp = null, enlaceListo = null;
  const dlg = modal({
    title: 'Compartir reporte', submitText: 'Enviar por correo', wide: true,
    body: `<label class="fx-inv"><input type="checkbox" name="invitado" ${soloArchivo ? 'checked disabled' : ''}>
        <span><strong>Invitado (sin cuenta Microsoft)</strong><small>Se envía el reporte como archivo: se abre en cualquier celular o PC sin iniciar sesión.</small></span></label>
      <div data-modo="enlace">
        <p style="margin-top:0">El <strong>enlace</strong> abre <strong>${esc(titulo)}</strong> en la aplicación, en <strong>solo lectura</strong>. Quien lo reciba ingresa con su cuenta de Microsoft 365 de la organización;
          si no es usuario de la app, <strong>sólo verá las pestañas de este reporte</strong>. <span class="muted small" id="fx-sp"></span></p>
        <div class="btns" style="flex-wrap:wrap"><input id="fx-url" readonly value="Generando el enlace…" style="flex:1 1 260px;min-width:0"><button type="button" class="btn" id="fx-copiar" disabled>Copiar enlace</button>
          <a class="btn" id="fx-abrir" href="#" target="_blank" rel="noopener" aria-disabled="true">Abrir</a>
          <a class="btn fx-wa" id="fx-wa" href="#" target="_blank" rel="noopener" title="Enviar el enlace por WhatsApp">${ICO_WA}WhatsApp</a></div>
      </div>
      <div data-modo="archivo" hidden>
        <p style="margin-top:0">Se enviará el <strong>archivo</strong> <em>${esc(nombre)}</em> (${tam}). Se abre en cualquier navegador <strong>sin iniciar sesión</strong>, con sus pestañas.
          <span class="muted small">Es una copia del momento: no se actualiza. Compártalo sólo con quien deba verlo (el archivo se puede reenviar).</span></p>
        <div class="btns" style="flex-wrap:wrap"><button type="button" class="btn fx-wa" id="fx-wa-arch">${ICO_WA}Enviar por WhatsApp</button>
          <button type="button" class="btn" id="fx-desc">Descargar archivo</button></div>
      </div>
      <div class="form" style="margin-top:14px">
        <label class="full">Para (correos separados por coma)<input name="para" placeholder="usuario@empresa.com, otro@empresa.com"></label>
        <label class="full">Asunto<input name="asunto" value="${esc(asunto)}" maxlength="250" required></label>
        <label class="full">Mensaje (opcional)<textarea name="mensaje" rows="3">Comparto el reporte "${esc(asunto)}".</textarea></label>
      </div>`,
    onSubmit: async (f) => {
      const para = String(f.para || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
      if (!para.length) throw new Error('Ingrese al menos un correo');
      const tema = String(f.asunto || '').trim() || asunto;
      const archivo = modoArchivo();
      if (!archivo) { await enlaceListo; if (!url) throw new Error('El enlace no está disponible: active "Invitado" para enviar el archivo.'); }
      const pie = `<p style="color:#5b6b80;font-size:12px">${esc(tema)} · Control de Unidades · ${esc(state.user?.nombre || '')}</p>`;
      const cuerpo = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#17212f"><p>${esc(f.mensaje || '').replace(/\n/g, '<br>')}</p>
        ${archivo ? `<p>Se adjunta el reporte <strong>${esc(nombre)}</strong>: ábralo con su navegador (Chrome, Edge, Safari…). No requiere iniciar sesión.</p>`
          : `<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Ver reporte</a></p>`}${pie}</div>`;
      try {
        if (archivo && blob.size > 2.8 * 1024 * 1024) throw new Error(`el archivo pesa ${tam} (máximo 2.8 MB por correo); envíelo por WhatsApp o descárguelo`);
        await G.asegurarPermisoCorreo();
        await G.enviarCorreo({ para, asunto: tema, html: cuerpo, adjuntos: archivo ? [{ nombre, tipo: 'text/html', base64: await aBase64(blob) }] : [] });
        toast(archivo ? `Reporte enviado como archivo a ${para.join(', ')}` : `Enlace enviado a ${para.join(', ')}`);
      } catch (e) {
        if (archivo) descargarBlob(blob, nombre);
        location.href = `mailto:${para.join(',')}?subject=${encodeURIComponent(tema)}&body=${encodeURIComponent(`${f.mensaje || ''}\n\n${archivo ? `(Adjunte el archivo descargado: ${nombre})` : url}`)}`;
        toast(`Se abrió su programa de correo (${e.message})`, true);
      }
    },
  });
  const chk = dlg.querySelector('[name=invitado]');
  const modoArchivo = () => chk.checked;
  const pintarModo = () => {
    dlg.querySelector('[data-modo=enlace]').hidden = modoArchivo();
    dlg.querySelector('[data-modo=archivo]').hidden = !modoArchivo();
    const msj = dlg.querySelector('[name=mensaje]');
    if (/^Comparto el reporte /.test(msj.value)) msj.value = `Comparto el reporte "${asunto}"${modoArchivo() ? ' (archivo adjunto; se abre sin iniciar sesión)' : ''}.`;
  };
  chk.addEventListener('change', pintarModo); pintarModo();
  const tema = () => dlg.querySelector('[name=asunto]')?.value.trim() || asunto;
  const mensaje = () => dlg.querySelector('[name=mensaje]')?.value.trim() || '';

  // ----- Enlace (usuarios con cuenta Microsoft): se genera en segundo plano; no hace falta si sólo se envía el archivo
  const wa = dlg.querySelector('#fx-wa');
  const actualizarWa = () => { wa.href = url ? `https://wa.me/?text=${encodeURIComponent(`*${tema()}*${mensaje() ? `\n${mensaje()}` : ''}\n\n${url}`)}` : '#'; };
  dlg.addEventListener('input', actualizarWa);
  wa.addEventListener('click', (e) => { if (!url) { e.preventDefault(); return; } actualizarWa(); if (window.Capacitor?.isNativePlatform?.()) { e.preventDefault(); location.href = wa.href; } });
  if (!soloArchivo) {
    enlaceListo = (async () => {
      try {
        const d = new Date(); const p = (n) => String(n).padStart(2, '0');
        const ruta = `Compartidos/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())} ${nombre}`;
        await G.subirArchivo(ruta, blob, 'text/html');
        // El enlace abre el reporte dentro de la app (SharePoint no muestra páginas HTML; sólo las descarga)
        try { urlSp = await G.crearEnlace(ruta); } catch { urlSp = null; }
        url = urlSp && /^https?:/.test(urlSp) ? `${G.appUrl()}#/ver?s=${G.tokenCompartido(urlSp)}` : `${G.appUrl()}#/ver?f=${encodeURIComponent(ruta)}`;
        dlg.querySelector('#fx-url').value = url;
        dlg.querySelector('#fx-copiar').disabled = false;
        const ab = dlg.querySelector('#fx-abrir'); ab.href = url; ab.removeAttribute('aria-disabled');
        if (urlSp) dlg.querySelector('#fx-sp').innerHTML = `Guardado en SharePoint (<em>Control Unidades Sal/Compartidos</em>): <a href="${esc(urlSp)}" target="_blank" rel="noopener">abrir archivo</a>.`;
        actualizarWa();
      } catch (e) {
        dlg.querySelector('#fx-url').value = `No se pudo crear el enlace (${e.message}). Active "Invitado" para enviar el archivo.`;
      }
    })();
  }

  // ----- Archivo (invitados): menú Compartir del sistema con el archivo adjunto (WhatsApp, Telegram, Gmail…)
  dlg.querySelector('#fx-desc').addEventListener('click', () => descargarBlob(blob, nombre));
  dlg.querySelector('#fx-wa-arch').addEventListener('click', async () => {
    const texto = `*${tema()}*${mensaje() ? `\n${mensaje()}` : ''}`;
    if (esNativa()) { descargarBlob(blob, nombre); return; } // app Android: abre el menú Compartir con el archivo
    const file = new File([blob], nombre, { type: 'text/html' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: tema(), text: texto }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    // Sin "Compartir" con archivos (p. ej. algunos navegadores de PC): se descarga y se abre WhatsApp para adjuntarlo
    descargarBlob(blob, nombre);
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n\n(Adjunto el archivo del reporte: ${nombre})`)}`, '_blank', 'noopener');
    toast('Se descargó el archivo: adjúntelo en el chat de WhatsApp (📎 › Documento).');
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
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = qs.get('f'), sh = qs.get('s');
  let texto, webUrl, archivo;
  if (sh && /^u![\w-]+$/.test(sh)) ({ texto, webUrl, nombre: archivo } = await G.leerCompartido(sh));
  else if (f && /^Compartidos\/[^/]+\.html$/.test(f) && state.user?.rol !== 'invitado') { ({ texto, webUrl } = await G.leerTexto(f)); archivo = f.split('/').pop(); }
  else { view.innerHTML = '<div class="alert bad">Enlace de reporte no válido.</div>'; return; }
  const nombre = String(archivo || 'Reporte').replace(/^\d{8}-\d{6}\s*/, '').replace(/\.html$/, '');
  view.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div class="card-h" style="padding:12px 16px;margin:0;border-bottom:1px solid var(--border)">
      <div><h2>${esc(nombre)}</h2><div class="muted small">Reporte compartido · solo lectura</div></div>
      <div class="btns"><button class="btn sm fx" id="v-desc" data-fx="html">${ICO.html}Descargar HTML</button>
      <button class="btn sm" id="v-nueva">Abrir en otra pestaña</button>${webUrl && state.user?.rol !== 'invitado' ? `<a class="btn sm" href="${esc(webUrl)}" target="_blank" rel="noopener">SharePoint</a>` : ''}</div></div>
    <iframe id="v-frame" title="${esc(nombre)}" sandbox="allow-same-origin allow-popups" style="display:block;width:100%;height:calc(100vh - 150px);border:0;background:var(--bg)"></iframe></div>`;
  const blob = () => new Blob([texto], { type: 'text/html;charset=utf-8' });
  // Como documento propio (blob) para que el menú lateral del reporte cambie de pestaña dentro del visor
  const u = URL.createObjectURL(blob());
  view.querySelector('#v-frame').src = u;
  window.addEventListener('hashchange', () => URL.revokeObjectURL(u), { once: true });
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
