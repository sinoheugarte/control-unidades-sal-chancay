import { state, api, esc, toast, $, $$, modal, destruirGraficos, redibujarGraficos, esAdmin, activarFechaHora24, activarOndas, activarTablas, activarEquilibrio } from './core.js?v=__V__';
import { mostrarIntro } from './intro.js?v=__V__';
import { activarExportes, ICO as FX, descargarHTML, vVer, fragmentoDe, elegirPantallas } from './compartir.js?v=__V__';
import { vTablero, vViajes, vRegistro } from './views-operacion.js?v=__V__';
import { vReportes, vTransportistas, vUnidades, vResumenes, vPlanificacion, vReporteTransportista } from './views-control.js?v=__V__';
import { vOperaciones, vImportar, vUsuarios } from './views-admin.js?v=__V__';
import * as G from './graph.js?v=__V__';
import { vPortal, vPortalUnidades } from './views-portal.js?v=__V__';
import { vResumenAnual } from './views-resumen.js?v=__V__';
import * as B from './backend.js?v=__V__';

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  tablero: I('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  registro: I('<path d="M12 5v14M5 12h14"/>'),
  viajes: I('<path d="M3 17h11V7H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  reportes: I('<path d="M4 4h16v16H4z"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
  transportistas: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  unidades: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'),
  resumenes: I('<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
  planificacion: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  operaciones: I('<path d="M2 20h20M4 20l2-9h12l2 9M9 11V6h6v5M12 6V3"/>'),
  importar: I('<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>'),
  usuarios: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
};

const RUTAS = {
  tablero: { t: 'Tablero', v: vTablero },
  registro: { t: 'Registro rápido', v: vRegistro },
  viajes: { t: 'Detalle de viajes', v: vViajes },
  reportes: { t: 'Reporte de avance', v: vReportes },
  transportistas: { t: 'Transportistas', v: vTransportistas },
  'reporte-transportista': { t: 'Reporte por transportista', v: vReporteTransportista, nav: 'transportistas' },
  unidades: { t: 'Lista de unidades', v: vUnidades },
  resumenes: { t: 'Resúmenes', v: vResumenes },
  planificacion: { t: 'Planificación', v: vPlanificacion },
  'resumen-anual': { t: 'Resumen para Exportaciones', v: vResumenAnual },
  operaciones: { t: 'Operaciones', v: vOperaciones },
  importar: { t: 'Importar datos', v: vImportar },
  usuarios: { t: 'Usuarios', v: vUsuarios, admin: true },
  ver: { t: 'Reporte compartido', v: vVer },
  // Portal del transportista (sólo sus viajes y unidades)
  portal: { t: 'Mis viajes', v: vPortal, portal: true },
  'portal-unidades': { t: 'Mis unidades', v: vPortalUnidades, portal: true },
};
const NAV = [
  ['Operación', ['tablero', 'reportes', 'resumenes', 'viajes', 'registro']],
  ['Control', ['planificacion', 'transportistas', 'unidades']],
  ['Administración', ['resumen-anual', 'operaciones', 'importar', 'usuarios']],
];
const NAV_PORTAL = [['Mi empresa', ['portal', 'portal-unidades']]];
const esTransp = () => state.user?.rol === 'transportista';
const esInvitado = () => state.user?.rol === 'invitado';
ICON.portal = ICON.viajes;
ICON.ver = ICON.reportes;
const COLOR = {
  tablero: '#2563eb', reportes: '#8b5cf6', resumenes: '#ec4899', viajes: '#0ea5e9', registro: '#10b981',
  planificacion: '#f59e0b', transportistas: '#f97316', unidades: '#14b8a6',
  'resumen-anual': '#6366f1', operaciones: '#0891b2', importar: '#22c55e', usuarios: '#64748b',
  portal: '#0ea5e9', 'portal-unidades': '#14b8a6',
};
const ORDEN_NAV = [...NAV.flatMap(([, it]) => it), ...NAV_PORTAL.flatMap(([, it]) => it)];
const icoNav = (k) => `<span class="ico" aria-hidden="true">${ICON[k] || ''}</span>`;
ICON['resumen-anual'] = ICON.reportes;
ICON['portal-unidades'] = ICON.unidades;

// Tema claro/oscuro persistente por navegador
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch { /* sin storage */ }

function vLogin(root, error = '') {
  const cfg = G.getCfg();
  root.innerHTML = `<div class="login"><div class="card">
    <div class="brand" style="color:var(--text);padding:0 0 6px"><div class="brand-logo">${ICON.viajes.replace('stroke="currentColor"', 'stroke="#fff"')}</div>
    <div>Control de Unidades<small style="color:var(--muted)">Despacho · Acopio · Embarque</small></div></div>
    <p class="muted" style="margin:14px 0 0">Ingrese con su cuenta corporativa de Microsoft 365. Los datos se guardan en SharePoint.</p>
    <div style="display:grid;gap:12px;margin-top:18px">
      <button class="btn primary" id="b-ms" style="justify-content:center;min-height:42px">
        <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
        Iniciar sesión con Microsoft</button>
      <p class="small" id="login-err" role="alert" style="color:var(--bad);margin:0">${esc(error)}</p>
      ${instalada() ? '' : `<button type="button" class="btn b-instalar" style="justify-content:center" ${avisoInstalar || esIOS() || /Android/i.test(navigator.userAgent) ? '' : 'hidden'}>📲 Instalar la app en este dispositivo</button>`}
      <details class="small"><summary class="muted">Configuración avanzada</summary>
        <form id="f-cfg" class="form" style="grid-template-columns:1fr;margin-top:10px">
          <label>Sitio de SharePoint<input name="spSite" value="${esc(cfg.spSite)}"></label>
          <label>Carpeta en la biblioteca de documentos<input name="carpeta" value="${esc(cfg.carpeta)}"></label>
          <label>Client ID (Entra ID)<input name="cid" value="${esc(cfg.cid)}"></label>
          <label>Tenant ID<input name="tid" value="${esc(cfg.tid)}"></label>
          <p class="muted" style="margin:0">Redirect URI a registrar (SPA): <code>${esc(G.appUrl())}</code></p>
          <button class="btn">Guardar configuración</button>
        </form></details>
    </div></div></div>`;
  $('#b-ms').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; $('#login-err').textContent = '';
    try {
      await G.login();
      await iniciar();
      // Si llegó por un enlace (p. ej. un reporte compartido), se mantiene ese destino
      if (!location.hash || /^#\/?login/.test(location.hash)) location.hash = '#/tablero';
      render();
    } catch (err) { $('#login-err').textContent = err.message; } finally { btn.disabled = false; }
  });
  $('#f-cfg').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    G.setCfg({ spSite: d.spSite.trim(), carpeta: d.carpeta.trim(), cid: d.cid.trim(), tid: d.tid.trim() });
    toast('Configuración guardada. Inicie sesión.');
  });
}

async function cargarOps() {
  state.ops = await api('/operaciones');
  let guardada = null;
  try { guardada = Number(localStorage.getItem('opId')); } catch { /* */ }
  if (!state.ops.some((o) => o.id === state.opId)) {
    state.opId = state.ops.find((o) => o.id === guardada)?.id ?? state.ops[0]?.id ?? null;
  }
}
export async function refrescarOps(selectId) {
  await cargarOps();
  if (selectId) setOp(selectId);
  pintarSelector();
}
function setOp(id) {
  state.opId = id;
  B.setOpActual(id);
  try { localStorage.setItem('opId', String(id)); } catch { /* */ }
}

async function iniciar() {
  state.user = await B.iniciarSesion();
  state.catalogos = await api('/catalogos');
  if (['transportista', 'invitado'].includes(state.user.rol)) { state.ops = []; state.opId = null; return; }
  await cargarOps();
  B.setOpActual(state.opId);
}

function pintarSelector() {
  const sel = $('#op-sel');
  if (!sel) return;
  sel.innerHTML = state.ops.length
    ? state.ops.map((o) => `<option value="${o.id}" ${o.id === state.opId ? 'selected' : ''}>${esc(o.nave)} · Orden ${esc(o.orden)}</option>`).join('')
    : '<option value="">Sin operaciones</option>';
  sel.insertAdjacentHTML('beforeend', '<option value="__buscar">🔍 Buscar / nueva operación…</option>');
}

function actualizarShell(ruta) {
  const act = RUTAS[ruta].nav || ruta;
  $$('#side .nav a').forEach((a) => {
    const on = a.dataset.k === act;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const h = $('#titulo');
  if (h) h.innerHTML = `<span class="ico" style="background:linear-gradient(145deg, ${COLOR[act] || '#2563eb'}, color-mix(in srgb, ${COLOR[act] || '#2563eb'} 70%, #000))">${ICON[act] || ''}</span>${esc(RUTAS[ruta].t)}`;
}
let shellDe = null;
function shell(root, ruta) {
  const clave = `${state.user?.email}|${state.user?.rol}`;
  if (shellDe === clave && $('#view', root)) { actualizarShell(ruta); pintarSelector(); return; }
  shellDe = clave;
  root.innerHTML = `<div class="layout${esInvitado() ? ' solo' : ''}">
    <aside class="side" id="side">
      <div class="brand"><div class="brand-logo">${ICON.viajes}</div><div>Control de Unidades<small>Despacho · Acopio · Embarque</small></div>
        <button type="button" class="cerrar-menu" id="menu-x" aria-label="Cerrar menú">✕</button></div>
      <nav class="nav">${(esTransp() ? NAV_PORTAL : esInvitado() ? [] : NAV).map(([sec, items]) => `<div class="sep">${sec}</div>${items.filter((k) => !RUTAS[k].admin || esAdmin())
        .map((k) => `<a href="#/${k}" data-k="${k}" style="--c:${COLOR[k] || '#3b82f6'}">${icoNav(k)}<span>${RUTAS[k].t}</span></a>`).join('')}`).join('')}</nav>
    </aside>
    <div class="menu-velo" id="menu-velo" aria-hidden="true"></div>
    <div class="main">
      <header class="top">
        <button class="btn sm menu-btn" id="menu" aria-label="Abrir menú">☰</button>
        <h1 id="titulo"></h1>
        <div class="grow"></div>
        ${esTransp() || esInvitado() ? '' : '<label style="min-width:220px" class="no-print"><span class="hidden">Operación</span><select id="op-sel" aria-label="Operación activa"></select></label>'}
        ${esInvitado() ? '' : `<button class="btn sm fx" id="b-html" data-fx="html" title="Descargar esta pantalla como página HTML">${FX.html}<span class="who">HTML</span></button>`}
        ${esTransp() || esInvitado() ? '' : `<button class="btn sm fx" id="b-link" data-fx="link" title="Crear un enlace de esta pantalla para compartir por correo">${FX.link}<span class="who">Compartir</span></button>`}
        ${instalada() ? '' : `<button class="btn sm b-instalar" title="Instalar en este dispositivo" ${avisoInstalar || esIOS() ? '' : 'hidden'}>📲 <span class="who">Instalar app</span></button>`}
        <button class="btn sm" id="tema" title="Cambiar tema claro/oscuro">Tema</button>
        <button class="btn sm" id="perfil" title="Mi cuenta: cambiar contraseña"><span class="who">${esc(state.user.nombre)} · </span>${esc(state.user.rol)}</button>
        <button class="btn sm" id="salir">Salir</button>
      </header>
      <main class="content" id="view"></main>
    </div></div>`;
  actualizarShell(ruta);
  pintarSelector();
  $('#op-sel')?.addEventListener('change', (e) => {
    if (e.target.value === '__buscar') { e.target.value = String(state.opId ?? ''); location.hash = '#/operaciones'; return; }
    setOp(Number(e.target.value)); render();
  });
  // Menú lateral en el teléfono: abrir / cerrar (botón ✕, toque en la zona oscura, deslizar a la izquierda, Esc o "Atrás")
  const menu = (abrir) => {
    const abierto = $('#side').classList.contains('open');
    if (abrir === abierto) return;
    $('#side').classList.toggle('open', abrir); $('#menu-velo').classList.toggle('on', abrir);
    $('#menu').setAttribute('aria-expanded', String(abrir));
    if (abrir) history.pushState({ menu: 1 }, ''); else if (history.state?.menu) history.back();
  };
  $('#menu').addEventListener('click', () => menu(!$('#side').classList.contains('open')));
  $('#menu-x').addEventListener('click', () => menu(false));
  $('#menu-velo').addEventListener('click', () => menu(false));
  let x0 = null;
  $('#side').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $('#side').addEventListener('touchend', (e) => { if (x0 != null && x0 - e.changedTouches[0].clientX > 60) menu(false); x0 = null; }, { passive: true });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu(false); });
  window.addEventListener('popstate', () => { if ($('#side')?.classList.contains('open')) { $('#side').classList.remove('open'); $('#menu-velo').classList.remove('on'); } });
  const tituloPag = () => $('#titulo')?.textContent.trim() || 'Reporte';
  const selector = (accion) => {
    const actual = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'tablero';
    elegirPantallas({ accion, actual: RUTAS[actual]?.nav || actual, capturar: capturarPantallas,
      rutas: NAV.flatMap(([, it]) => it).filter((k) => !NO_COMPARTIR.includes(k) && (!RUTAS[k].admin || esAdmin()))
        .map((k) => ({ k, t: RUTAS[k].t, c: COLOR[k], ico: ICON[k] })) });
  };
  $('#b-html')?.addEventListener('click', () => (esTransp() ? descargarHTML($('#view'), tituloPag()) : selector('html')));
  $('#b-link')?.addEventListener('click', () => selector('compartir'));
  $('#side').addEventListener('click', (e) => { if (e.target.closest('a') && $('#side').classList.contains('open')) { $('#side').classList.remove('open'); $('#menu-velo').classList.remove('on'); } });
  $('#salir').addEventListener('click', () => { B.cerrarSesion(); state.user = null; shellDe = null; location.hash = '#/login'; });
  $('#tema').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('tema', document.documentElement.dataset.theme); } catch { /* */ }
    render();
  });
  $('#perfil').addEventListener('click', async () => modal({
    title: 'Mi cuenta',
    body: `<p><strong>${esc(state.user.nombre)}</strong><br><span class="muted">${esc(state.user.email)}</span></p>
      <p>Rol en la aplicación: <span class="pill info">${esc(state.user.rol)}</span></p>
      ${esInvitado() ? `<div class="alert" style="margin-bottom:10px">Esta cuenta <strong>no está registrada</strong> como usuario: sólo puede ver reportes compartidos.
        Si debería ver las operaciones, verifique que ingresó con la misma cuenta que en su PC o pida a un administrador que la registre en <em>Usuarios</em>.</div>` : ''}
      ${esTransp() || esInvitado() ? '' : `<p class="small muted" style="margin:0 0 10px">Operaciones visibles: <strong>${state.ops.length}</strong> ·
        Datos en <strong>${esc(G.getCfg().spSite.replace(/^https:\/\//, ''))}</strong> / ${esc(G.getCfg().carpeta)} · Versión ${esc(VERSION_APP)}</p>`}
      ${state.user.transportista ? `<p>Empresa: <strong>${esc(state.user.transportista.razon_social)}</strong> · RUC ${esc(state.user.transportista.ruc)}</p>
        <p class="muted small">Usted sólo ve los viajes y unidades de su empresa.</p>`
        : `<p class="muted small">Los datos se guardan en SharePoint: <a href="${esc(await G.urlCarpeta())}" target="_blank" rel="noopener">abrir carpeta</a>.</p>`}`,
  }));
}

/* Pestañas que no se comparten (formularios y administración) */
const NO_COMPARTIR = ['registro', 'operaciones', 'importar', 'usuarios'];
/** Recorre las pestañas elegidas (en la misma pantalla, sin animaciones) y devuelve su contenido listo para el reporte. */
async function capturarPantallas(keys) {
  const view = $('#view');
  const velo = document.createElement('div');
  velo.className = 'velo-captura';
  velo.innerHTML = '<div class="card"><div class="cargando"><i></i><span>Preparando el reporte…</span><small class="muted" id="velo-paso"></small></div></div>';
  document.body.appendChild(velo);
  const animAntes = window.Chart ? Chart.defaults.animation : null;
  if (window.Chart) Chart.defaults.animation = false;
  const id = ++renderId;
  const secciones = [];
  try {
    for (const [i, k] of keys.entries()) {
      velo.querySelector('#velo-paso').textContent = `${i + 1} de ${keys.length}: ${RUTAS[k].t}`;
      destruirGraficos();
      view.classList.remove('sale', 'entra', 'atras');
      view.innerHTML = '';
      try { await RUTAS[k].v(view, { rerender: () => {} }); } catch (e) { view.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
      await espera(450);
      secciones.push({ titulo: RUTAS[k].t, html: fragmentoDe(view), ico: ICON[k], c: COLOR[k] });
    }
  } finally {
    if (window.Chart) Chart.defaults.animation = animAntes;
    velo.remove();
    if (id === renderId) { rutaAnterior = null; render(); }
  }
  return secciones;
}

let renderId = 0;
let rutaAnterior = null;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function render() {
  const root = $('#app');
  const ruta = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'tablero');
  destruirGraficos();
  if (G.esRetornoLogin()) { root.innerHTML = '<div class="login"><div class="card">Completando inicio de sesión…</div></div>'; return; }
  let errorLogin = '';
  if (!state.user) {
    try {
      const redir = await G.completarRedireccion();
      if (redir || G.haySesion()) await iniciar();
    } catch (e) { state.user = null; errorLogin = e.message; }
  }
  if (!state.user || ruta === 'login') {
    if (state.user && ruta === 'login') { location.hash = '#/tablero'; return; }
    shellDe = null; rutaAnterior = null;
    return vLogin(root, errorLogin);
  }
  const qOp = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('op'));
  if (qOp && !esTransp() && qOp !== state.opId && state.ops.some((o) => o.id === qOp)) setOp(qOp);
  const permitida = (k) => RUTAS[k] && (esInvitado() ? k === 'ver' : esTransp() ? RUTAS[k].portal : !RUTAS[k].portal && (!RUTAS[k].admin || esAdmin()));
  if (esInvitado() && !permitida(ruta)) {
    shell(root, 'ver');
    $('#view').innerHTML = `<div class="card empty"><h2>Acceso sólo a reportes compartidos</h2>
      <p>Su cuenta (${esc(state.user.email)}) no está registrada como usuario de Control de Unidades. Puede ver los reportes que le compartan abriendo el enlace que recibió por correo.</p>
      <p class="muted small">Para usar la aplicación completa, pida a un administrador que lo registre en <em>Usuarios</em>.</p></div>`;
    return;
  }
  const r = permitida(ruta) ? ruta : esTransp() ? 'portal' : 'tablero';
  const nueva = !$('#view');
  shell(root, r);
  document.title = `${RUTAS[r].t} · Control de Unidades`;
  const id = ++renderId;
  const view = $('#view');
  const cambia = rutaAnterior !== r;
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atras = rutaAnterior && ORDEN_NAV.indexOf(r) < ORDEN_NAV.indexOf(rutaAnterior);
  rutaAnterior = r;
  // Salida suave de la pantalla anterior (como al navegar en iOS / macOS)
  if (cambia && !nueva && !reducido && view.childElementCount) {
    view.classList.remove('entra', 'atras');
    view.classList.add('sale'); view.classList.toggle('atras', !!atras);
    await espera(150);
    if (id !== renderId) return;
  }
  view.classList.remove('sale', 'entra', 'atras');
  const cargando = setTimeout(() => { if (id === renderId) view.innerHTML = '<div class="cargando"><i></i><span>Cargando…</span></div>'; }, cambia ? 0 : 250);
  try {
    await RUTAS[r].v(view, { rerender: () => id === renderId && render() });
  } catch (err) {
    if (id === renderId) view.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`;
  } finally { clearTimeout(cargando); }
  if (id !== renderId) return;
  // Entrada escalonada de los bloques de la pantalla
  if (cambia && !reducido) {
    [...view.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
    void view.offsetWidth;
    view.classList.add('entra'); view.classList.toggle('atras', !!atras);
    setTimeout(() => { if (id === renderId) { view.classList.remove('entra', 'atras'); redibujarGraficos(); } }, 1100);
  } else setTimeout(redibujarGraficos, 60);
}

activarFechaHora24(document.body);
/* ---------- App instalable (PWA) ---------- */
if ('serviceWorker' in navigator && !'__V__'.includes('_V_')) navigator.serviceWorker.register('sw.js').catch(() => { /* sin soporte */ });
let avisoInstalar = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || !!window.Capacitor?.isNativePlatform?.();
const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); avisoInstalar = e; document.querySelectorAll('.b-instalar').forEach((b) => { b.hidden = false; }); });
window.addEventListener('appinstalled', () => { avisoInstalar = null; document.querySelectorAll('.b-instalar').forEach((b) => { b.hidden = true; }); toast('Aplicación instalada. Ábrala desde el ícono "Control Sal".'); });
function instalar() {
  if (avisoInstalar) { avisoInstalar.prompt(); avisoInstalar.userChoice.finally(() => { avisoInstalar = null; }); return; }
  modal({ title: 'Instalar la aplicación', body: esIOS()
    ? `<ol style="margin:0;padding-left:20px;display:grid;gap:8px"><li>Abra esta página en <strong>Safari</strong>.</li><li>Toque <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).</li>
        <li>Elija <strong>"Agregar a inicio"</strong> y confirme con <strong>Agregar</strong>.</li><li>Abra <strong>Control Sal</strong> desde el ícono en su pantalla de inicio.</li></ol>`
    : `<ol style="margin:0;padding-left:20px;display:grid;gap:8px"><li>Abra esta página en <strong>Chrome</strong> o <strong>Edge</strong>.</li><li>Toque el menú <strong>⋮</strong>.</li>
        <li>Elija <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li><li>Abra <strong>Control Sal</strong> desde el ícono.</li></ol>` });
}
document.addEventListener('click', (e) => { if (e.target.closest('.b-instalar')) instalar(); });
activarOndas(document);
activarTablas(document.body);
activarEquilibrio(document.body);
activarExportes(document.body);
mostrarIntro();

// Aviso de nueva versión publicada (evita trabajar con una copia antigua guardada en el navegador)
const VERSION_APP = '__V__';
async function revisarVersion() {
  if (VERSION_APP.includes('_V_')) return; // desarrollo local
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== VERSION_APP && !document.getElementById('aviso-version')) {
      const d = document.createElement('div');
      d.id = 'aviso-version';
      d.setAttribute('role', 'status');
      d.className = 'aviso-version';
      d.innerHTML = '<span>✨ Hay una nueva versión de la aplicación.</span><button class="btn sm" id="b-act-version">Actualizar</button>';
      document.body.appendChild(d);
      d.querySelector('button').onclick = () => location.reload();
    }
  } catch { /* sin conexión */ }
}
revisarVersion();
setInterval(revisarVersion, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVersion(); });
window.addEventListener('hashchange', render);
window.addEventListener('app:ops', (e) => {
  const { id, render: rerender = true, luego } = e.detail || {};
  refrescarOps(id).then(() => { if (luego) luego(); else if (rerender) render(); });
});
render();
$$('dialog').forEach((d) => d.remove());
