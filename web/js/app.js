import { state, api, esc, toast, $, $$, modal, destruirGraficos, esAdmin } from './core.js?v=__V__';
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
  importar: I('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  usuarios: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
};

const RUTAS = {
  tablero: { t: 'Tablero', v: vTablero },
  registro: { t: 'Registro rápido', v: vRegistro },
  viajes: { t: 'Detalle de viajes', v: vViajes },
  reportes: { t: 'Reportes por turno', v: vReportes },
  transportistas: { t: 'Transportistas', v: vTransportistas },
  'reporte-transportista': { t: 'Reporte por transportista', v: vReporteTransportista, nav: 'transportistas' },
  unidades: { t: 'Lista de unidades', v: vUnidades },
  resumenes: { t: 'Resúmenes', v: vResumenes },
  planificacion: { t: 'Planificación', v: vPlanificacion },
  'resumen-anual': { t: 'Resumen anual', v: vResumenAnual },
  operaciones: { t: 'Operaciones', v: vOperaciones },
  importar: { t: 'Importar datos', v: vImportar },
  usuarios: { t: 'Usuarios', v: vUsuarios, admin: true },
  // Portal del transportista (sólo sus viajes y unidades)
  portal: { t: 'Mis viajes', v: vPortal, portal: true },
  'portal-unidades': { t: 'Mis unidades', v: vPortalUnidades, portal: true },
};
const NAV = [
  ['Operación', ['tablero', 'registro', 'viajes', 'reportes']],
  ['Control', ['transportistas', 'unidades', 'resumenes', 'planificacion']],
  ['Administración', ['resumen-anual', 'operaciones', 'importar', 'usuarios']],
];
const NAV_PORTAL = [['Mi empresa', ['portal', 'portal-unidades']]];
const esTransp = () => state.user?.rol === 'transportista';
ICON.portal = ICON.viajes;
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
      location.hash = '#/tablero';
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
  if (state.user.rol === 'transportista') { state.ops = []; state.opId = null; return; }
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

function shell(root, ruta) {
  root.innerHTML = `<div class="layout">
    <aside class="side" id="side">
      <div class="brand"><div class="brand-logo">${ICON.viajes}</div><div>Control de Unidades<small>Despacho · Acopio · Embarque</small></div></div>
      <nav class="nav">${(esTransp() ? NAV_PORTAL : NAV).map(([sec, items]) => `<div class="sep">${sec}</div>${items.filter((k) => !RUTAS[k].admin || esAdmin())
        .map((k) => { const on = k === (RUTAS[ruta].nav || ruta); return `<a href="#/${k}" class="${on ? 'active' : ''}" ${on ? 'aria-current="page"' : ''}>${ICON[k]}${RUTAS[k].t}</a>`; }).join('')}`).join('')}</nav>
    </aside>
    <div class="main">
      <header class="top">
        <button class="btn sm menu-btn" id="menu" aria-label="Abrir menú">☰</button>
        <h1>${esc(RUTAS[ruta].t)}</h1>
        <div class="grow"></div>
        ${esTransp() ? '' : '<label style="min-width:220px" class="no-print"><span class="hidden">Operación</span><select id="op-sel" aria-label="Operación activa"></select></label>'}
        <button class="btn sm" id="tema" title="Cambiar tema claro/oscuro">Tema</button>
        <button class="btn sm" id="perfil" title="Mi cuenta: cambiar contraseña"><span class="who">${esc(state.user.nombre)} · </span>${esc(state.user.rol)}</button>
        <button class="btn sm" id="salir">Salir</button>
      </header>
      <main class="content" id="view"></main>
    </div></div>`;
  pintarSelector();
  $('#op-sel')?.addEventListener('change', (e) => {
    if (e.target.value === '__buscar') { e.target.value = String(state.opId ?? ''); location.hash = '#/operaciones'; return; }
    setOp(Number(e.target.value)); render();
  });
  $('#menu').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#side').addEventListener('click', (e) => { if (e.target.closest('a')) $('#side').classList.remove('open'); });
  $('#salir').addEventListener('click', () => { B.cerrarSesion(); state.user = null; location.hash = '#/login'; });
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
      ${state.user.transportista ? `<p>Empresa: <strong>${esc(state.user.transportista.razon_social)}</strong> · RUC ${esc(state.user.transportista.ruc)}</p>
        <p class="muted small">Usted sólo ve los viajes y unidades de su empresa.</p>`
        : `<p class="muted small">Los datos se guardan en SharePoint: <a href="${esc(await G.urlCarpeta())}" target="_blank" rel="noopener">abrir carpeta</a>.</p>`}`,
  }));
}

let renderId = 0;
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
    return vLogin(root, errorLogin);
  }
  const qOp = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('op'));
  if (qOp && !esTransp() && qOp !== state.opId && state.ops.some((o) => o.id === qOp)) setOp(qOp);
  const permitida = (k) => RUTAS[k] && (esTransp() ? RUTAS[k].portal : !RUTAS[k].portal && (!RUTAS[k].admin || esAdmin()));
  const r = permitida(ruta) ? ruta : esTransp() ? 'portal' : 'tablero';
  shell(root, r);
  document.title = `${RUTAS[r].t} · Control de Unidades`;
  const id = ++renderId;
  const view = $('#view');
  view.innerHTML = '<div class="empty">Cargando…</div>';
  try {
    await RUTAS[r].v(view, { rerender: () => id === renderId && render() });
  } catch (err) {
    if (id === renderId) view.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('app:ops', (e) => {
  const { id, render: rerender = true, luego } = e.detail || {};
  refrescarOps(id).then(() => { if (luego) luego(); else if (rerender) render(); });
});
render();
$$('dialog').forEach((d) => d.remove());
