// Utilidades compartidas: API, formato, DOM, diálogos y notificaciones.
import { request } from './backend.js?v=__V__';

export const state = { user: null, ops: [], opId: null, catalogos: null };

export async function api(path, opts = {}) {
  try {
    return await request(path, opts);
  } catch (e) {
    if (e.status === 401 && path !== '/me') { state.user = null; location.hash = '#/login'; }
    throw e;
  }
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = (d) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [nf(0), nf(1), nf(2), nf(3)];
export const num = (v, d = 2) => (v === null || v === undefined || v === '' || isNaN(v) ? '—' : NF[d].format(v));
export const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${num(v * 100, d)} %`);
export const fecha = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const fechaHora = (s) => (s ? `${fecha(s)} ${String(s).slice(11, 16)}` : '—');
export const horas = (h) => {
  if (h === null || h === undefined) return '—';
  const neg = h < 0; const t = Math.round(Math.abs(h) * 60);
  return `${neg ? '-' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
export const minutos = (m) => (m === null || m === undefined ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
/** "YYYY-MM-DD HH:MM" -> valor de <input type="datetime-local"> */
export const toInputDT = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');
export const ahoraInput = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const hoyInput = () => ahoraInput().slice(0, 10);
export const normPlaca = (v) => String(v ?? '').trim().replace(/[-\s]/g, '').toUpperCase();

export const puedeEscribir = () => ['admin', 'operador'].includes(state.user?.rol);
export const esAdmin = () => state.user?.rol === 'admin';

export function statusPill(s) {
  const cls = s === 'DESCARGADO' ? 'ok' : s === 'FALTA DESCARGAR' ? 'warn' : s === 'TN DEVUELTAS' ? 'bad' : 'info';
  return `<span class="pill ${cls}">${esc(s || '—')}</span>`;
}
export function rangoPill(r) {
  if (!r) return '—';
  const cls = r === '<=30 MIN' ? 'ok' : r === '>=1 HR' ? 'bad' : 'warn';
  return `<span class="pill ${cls}">${esc(r)}</span>`;
}

export function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = `t${bad ? ' bad' : ''}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Lee un formulario a objeto plano (checkbox -> boolean). */
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}

/**
 * Diálogo modal con formulario. onSubmit(data) puede lanzar error para mantenerlo abierto.
 * Devuelve el elemento <dialog>.
 */
export function modal({ title, body, submitText = 'Guardar', onSubmit, wide = false, onOpen }) {
  const dlg = document.createElement('dialog');
  if (wide) dlg.style.width = 'min(1000px, calc(100vw - 32px))';
  dlg.innerHTML = `<form method="dialog" novalidate>
    <div class="dh"><h2>${esc(title)}</h2><button type="button" class="btn sm" data-close aria-label="Cerrar">✕</button></div>
    <div class="db">${body}</div>
    <div class="df">${onSubmit ? `<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${esc(submitText)}</button>` : '<button type="button" class="btn" data-close>Cerrar</button>'}</div>
  </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', () => dlg.remove());
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', close));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await onSubmit(formData(form), form); close(); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  });
  dlg.showModal();
  onOpen?.(dlg, form);
  form.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  return dlg;
}

export async function confirmar(texto) {
  return new Promise((resolve) => {
    const dlg = modal({ title: 'Confirmar', body: `<p>${esc(texto)}</p>`, submitText: 'Sí, continuar', onSubmit: async () => resolve(true) });
    dlg.addEventListener('close', () => resolve(false));
  });
}

/** Tabla genérica. cols: [{t: título, k: clave | f: (fila)=>html, n: numérica, d: decimales}] */
export function tabla(cols, filas, { foot, empty = 'Sin registros', rowAttr } = {}) {
  if (!filas.length) return `<div class="empty">${esc(empty)}</div>`;
  const cel = (c, r) => {
    if (c.f) return c.f(r);
    const v = r[c.k];
    return c.n ? num(v, c.d ?? 2) : esc(v ?? '—');
  };
  return `<div class="table-wrap"><table>
    <thead><tr>${cols.map((c) => `<th class="${c.n ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((r) => `<tr ${rowAttr ? rowAttr(r) : ''}>${cols.map((c) => `<td class="${c.n ? 'num' : ''}">${cel(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${cols.map((c, i) => `<td class="${c.n ? 'num' : ''}">${foot[i] ?? ''}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>`;
}

export const opActual = () => state.ops.find((o) => o.id === state.opId) || null;

export function sinOperacion() {
  return `<div class="card empty"><h2>No hay operación seleccionada</h2>
    <p>Cree una operación (nave / orden) o importe el libro Excel existente.</p>
    <a class="btn primary" href="#/operaciones">Ir a Operaciones</a></div>`;
}

/** Descarga un Blob generado en el navegador. */
export function descargarBlob(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** Descarga un archivo generado por la "API" local (rutas /api/...exportar...). */
export async function descargar(url) {
  try {
    toast('Generando archivo…');
    const { blob, nombre } = await request(url.replace(/^\/api/, ''));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (e) { toast(e.message, true); }
}

// Paleta para gráficos (lee variables CSS para respetar el tema)
export function colores() {
  const cs = getComputedStyle(document.documentElement);
  return {
    serie: ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'].map((v) => cs.getPropertyValue(v).trim()),
    texto: cs.getPropertyValue('--muted').trim(),
    grid: cs.getPropertyValue('--border').trim(),
    ok: cs.getPropertyValue('--ok').trim(),
    warn: cs.getPropertyValue('--warn').trim(),
    bad: cs.getPropertyValue('--bad').trim(),
  };
}

const charts = new Set();
export function chart(canvas, config) {
  if (!window.Chart || !canvas) return null;
  const c = colores();
  Chart.defaults.color = c.texto;
  Chart.defaults.borderColor = c.grid;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const ch = new Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, ...config.options } });
  charts.add(ch);
  return ch;
}
export function destruirGraficos() { charts.forEach((c) => c.destroy()); charts.clear(); }
