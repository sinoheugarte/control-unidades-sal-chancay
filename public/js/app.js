import { state, api, esc, toast, $, $$, modal, destruirGraficos, esAdmin } from './core.js';
import { vTablero, vViajes, vRegistro } from './views-operacion.js';
import { vReportes, vTransportistas, vUnidades, vResumenes, vPlanificacion } from './views-control.js';
import { vOperaciones, vImportar, vUsuarios } from './views-admin.js';

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
  unidades: { t: 'Lista de unidades', v: vUnidades },
  resumenes: { t: 'Resúmenes', v: vResumenes },
  planificacion: { t: 'Planificación', v: vPlanificacion },
  operaciones: { t: 'Operaciones', v: vOperaciones },
  importar: { t: 'Importar datos', v: vImportar },
  usuarios: { t: 'Usuarios', v: vUsuarios, admin: true },
};
const NAV = [
  ['Operación', ['tablero', 'registro', 'viajes', 'reportes']],
  ['Control', ['transportistas', 'unidades', 'resumenes', 'planificacion']],
  ['Administración', ['operaciones', 'importar', 'usuarios']],
];

// Tema claro/oscuro persistente por navegador
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch { /* sin storage */ }

function vLogin(root) {
  root.innerHTML = `<div class="login"><div class="card">
    <div class="brand" style="color:var(--text);padding:0 0 6px"><div class="brand-logo">${ICON.viajes.replace('stroke="currentColor"', 'stroke="#fff"')}</div>
    <div>Control de Unidades<small style="color:var(--muted)">Despacho · Acopio · Embarque</small></div></div>
    <form id="f-login">
      <label>Usuario<input name="usuario" autocomplete="username" required></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit" style="justify-content:center">Ingresar</button>
      <p class="muted small" id="login-err" role="alert"></p>
    </form></div></div>`;
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      state.user = await api('/login', { method: 'POST', body: { usuario: f.usuario.value, password: f.password.value } });
      await iniciar();
      location.hash = '#/tablero';
    } catch (err) { $('#login-err').textContent = err.message; } finally { btn.disabled = false; }
  });
  $('[name=usuario]', root).focus();
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
  try { localStorage.setItem('opId', String(id)); } catch { /* */ }
}

async function iniciar() {
  state.catalogos = await api('/catalogos');
  await cargarOps();
}

function pintarSelector() {
  const sel = $('#op-sel');
  if (!sel) return;
  sel.innerHTML = state.ops.length
    ? state.ops.map((o) => `<option value="${o.id}" ${o.id === state.opId ? 'selected' : ''}>${esc(o.nave)} · Orden ${esc(o.orden)}</option>`).join('')
    : '<option value="">Sin operaciones</option>';
}

function shell(root, ruta) {
  root.innerHTML = `<div class="layout">
    <aside class="side" id="side">
      <div class="brand"><div class="brand-logo">${ICON.viajes}</div><div>Control de Unidades<small>Despacho · Acopio · Embarque</small></div></div>
      <nav class="nav">${NAV.map(([sec, items]) => `<div class="sep">${sec}</div>${items.filter((k) => !RUTAS[k].admin || esAdmin())
        .map((k) => `<a href="#/${k}" class="${k === ruta ? 'active' : ''}" ${k === ruta ? 'aria-current="page"' : ''}>${ICON[k]}${RUTAS[k].t}</a>`).join('')}`).join('')}</nav>
    </aside>
    <div class="main">
      <header class="top">
        <button class="btn sm menu-btn" id="menu" aria-label="Abrir menú">☰</button>
        <h1>${esc(RUTAS[ruta].t)}</h1>
        <div class="grow"></div>
        <label style="min-width:220px" class="no-print"><span class="hidden">Operación</span><select id="op-sel" aria-label="Operación activa"></select></label>
        <button class="btn sm" id="tema" title="Cambiar tema claro/oscuro">Tema</button>
        <button class="btn sm" id="perfil" title="Mi cuenta: cambiar contraseña"><span class="who">${esc(state.user.nombre)} · </span>${esc(state.user.rol)}</button>
        <button class="btn sm" id="salir">Salir</button>
      </header>
      <main class="content" id="view"></main>
    </div></div>`;
  pintarSelector();
  $('#op-sel').addEventListener('change', (e) => { setOp(Number(e.target.value)); render(); });
  $('#menu').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#side').addEventListener('click', (e) => { if (e.target.closest('a')) $('#side').classList.remove('open'); });
  $('#salir').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); state.user = null; location.hash = '#/login'; });
  $('#tema').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('tema', document.documentElement.dataset.theme); } catch { /* */ }
    render();
  });
  $('#perfil').addEventListener('click', () => modal({
    title: 'Cambiar mi contraseña',
    body: `<div class="form"><label class="full">Contraseña actual<input type="password" name="actual" required autocomplete="current-password"></label>
      <label class="full">Nueva contraseña (mín. 8)<input type="password" name="nueva" minlength="8" required autocomplete="new-password"></label></div>`,
    onSubmit: async (d) => { await api('/me/password', { method: 'POST', body: d }); toast('Contraseña actualizada'); },
  }));
}

let renderId = 0;
async function render() {
  const root = $('#app');
  const ruta = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'tablero');
  destruirGraficos();
  if (!state.user) {
    try { state.user = await api('/me'); await iniciar(); } catch { state.user = null; }
  }
  if (!state.user || ruta === 'login') {
    if (state.user && ruta === 'login') { location.hash = '#/tablero'; return; }
    return vLogin(root);
  }
  const r = RUTAS[ruta] && (!RUTAS[ruta].admin || esAdmin()) ? ruta : 'tablero';
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
  const { id, render: rerender = true } = e.detail || {};
  refrescarOps(id).then(() => rerender && render());
});
render();
$$('dialog').forEach((d) => d.remove());
