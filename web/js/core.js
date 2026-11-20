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
    if (!horasValidas(form)) return;
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

/* ---------- Fecha y hora en formato 24 h ----------
   Los <input type="datetime-local"> muestran AM/PM según la configuración regional de Windows.
   Se reemplazan por fecha + hora "HH:MM" (00:00 a 23:59). El valor se sigue enviando con el mismo
   nombre de campo y el mismo formato ("YYYY-MM-DDTHH:MM"). */
const NATIVO = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
export const HORA_24 = /^([01]\d|2[0-3]):[0-5]\d$/;
function convertirFechaHora(el) {
  if (el.dataset.dt24) return;
  const requerido = el.required;
  const caja = document.createElement('span');
  caja.className = 'dt24';
  const d = document.createElement('input'); d.type = 'date'; d.className = 'dt24-d'; d.setAttribute('aria-label', 'Fecha');
  const h = document.createElement('input'); h.type = 'text'; h.className = 'dt24-h'; h.inputMode = 'numeric'; h.maxLength = 5;
  h.placeholder = 'HH:MM'; h.pattern = '([01][0-9]|2[0-3]):[0-5][0-9]'; h.title = 'Hora en formato de 24 horas (00:00 a 23:59)'; h.setAttribute('aria-label', 'Hora (24 h)');
  d.required = h.required = requerido;
  el.required = false;
  el.dataset.dt24 = '1';
  el.type = 'hidden';
  el.parentNode.insertBefore(caja, el);
  const reloj = document.createElement('button');
  reloj.type = 'button'; reloj.className = 'btn dt24-r'; reloj.title = 'Elegir hora (24 h)'; reloj.setAttribute('aria-label', 'Elegir hora en formato de 24 horas');
  reloj.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  caja.append(d, h, reloj, el);
  reloj.addEventListener('click', () => abrirReloj(reloj, h, d));
  const pintar = (v) => { const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); d.value = m ? m[1] : ''; h.value = m ? m[2] : ''; };
  const leer = () => {
    if (d.value && HORA_24.test(h.value)) return `${d.value}T${h.value}`;
    if (d.value && !h.value && !requerido) return `${d.value}T00:00`;
    return '';
  };
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() { return NATIVO.get.call(el); },
    set(v) { NATIVO.set.call(el, v ?? ''); pintar(v); },
  });
  pintar(NATIVO.get.call(el));
  d.defaultValue = d.value; h.defaultValue = h.value;
  const sync = () => { NATIVO.set.call(el, leer()); el.dispatchEvent(new Event('change', { bubbles: true })); };
  d.addEventListener('change', sync);
  h.addEventListener('input', () => {
    let t = h.value.replace(/[^\d]/g, '').slice(0, 4);
    if (t.length > 2) t = `${t.slice(0, 2)}:${t.slice(2)}`;
    h.value = t;
    h.setCustomValidity(t && !HORA_24.test(t) ? 'Hora en formato de 24 horas: 00:00 a 23:59' : '');
    sync();
  });
  h.addEventListener('blur', () => { const m = h.value.match(/^(\d{1,2}):?(\d{0,2})$/); if (m && h.value && !HORA_24.test(h.value)) { h.value = `${m[1].padStart(2, '0')}:${(m[2] || '00').padEnd(2, '0')}`; h.dispatchEvent(new Event('input')); } });
}
/** Desplegable de reloj de 24 h: columnas de horas (00-23) y minutos (00-59). */
let relojAbierto = null;
function cerrarReloj() { if (relojAbierto) { relojAbierto.remove(); relojAbierto = null; } }
function abrirReloj(boton, h, d) {
  if (relojAbierto) { const era = relojAbierto.dataset.para === h.dataset.rid; cerrarReloj(); if (era) return; }
  h.dataset.rid = h.dataset.rid || String(Math.random()).slice(2);
  const [hh, mm] = HORA_24.test(h.value) ? h.value.split(':') : ['', ''];
  const p = (n) => String(n).padStart(2, '0');
  const pop = document.createElement('div');
  pop.className = 'reloj24'; pop.dataset.para = h.dataset.rid;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Elegir hora (24 h)');
  pop.innerHTML = `<div class="reloj24-t">Hora (24 h)</div>
    <div class="reloj24-cols reloj24-cab"><span>Hora</span><span>Min</span></div>
    <div class="reloj24-cols">
      <div class="reloj24-col" data-col="h" aria-label="Horas">${Array.from({ length: 24 }, (_, i) => `<button type="button" data-h="${p(i)}" class="${p(i) === hh ? 'on' : ''}">${p(i)}</button>`).join('')}</div>
      <div class="reloj24-col" data-col="m" aria-label="Minutos">${Array.from({ length: 60 }, (_, i) => `<button type="button" data-m="${p(i)}" class="${p(i) === mm ? 'on' : ''}">${p(i)}</button>`).join('')}</div>
    </div>
    <div class="reloj24-pie"><button type="button" class="btn sm" data-ahora>Ahora</button><button type="button" class="btn sm primary" data-listo>Listo</button></div>`;
  // Dentro del diálogo abierto (si lo hay) para quedar por encima de él; posición fija respecto de la ventana
  (boton.closest('dialog') || document.body).appendChild(pop);
  relojAbierto = pop;
  const r = boton.getBoundingClientRect();
  const alto = 300, ancho = 190;
  const top = r.bottom + 6 + alto > innerHeight ? Math.max(8, r.top - alto - 6) : r.bottom + 6;
  Object.assign(pop.style, { position: 'fixed', top: `${top}px`, left: `${Math.min(innerWidth - ancho - 8, Math.max(8, r.right - ancho))}px`, margin: '0' });
  pop.querySelectorAll('.on').forEach((b) => b.scrollIntoView({ block: 'center' }));
  const poner = (nh, nm) => {
    const [ah, am] = HORA_24.test(h.value) ? h.value.split(':') : ['', '00'];
    h.value = `${nh ?? (ah || '00')}:${nm ?? (am || '00')}`;
    if (!d.value) { const t = new Date(); d.value = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; d.dispatchEvent(new Event('change')); }
    h.dispatchEvent(new Event('input'));
    pop.querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('on', b.dataset.h === h.value.slice(0, 2)));
    pop.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === h.value.slice(3, 5)));
  };
  pop.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.h) poner(t.dataset.h, null);
    else if (t.dataset.m) { poner(null, t.dataset.m); cerrarReloj(); h.focus(); }
    else if ('ahora' in t.dataset) { const n = new Date(); poner(p(n.getHours()), p(n.getMinutes())); cerrarReloj(); h.focus(); }
    else if ('listo' in t.dataset) { cerrarReloj(); h.focus(); }
  });
  setTimeout(() => {
    const fuera = (e) => { if (!relojAbierto) return document.removeEventListener('pointerdown', fuera, true);
      if (!pop.contains(e.target) && e.target !== boton && !boton.contains(e.target)) { cerrarReloj(); document.removeEventListener('pointerdown', fuera, true); } };
    document.addEventListener('pointerdown', fuera, true);
  });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrarReloj(); boton.focus(); } });
  (pop.querySelector('[data-h].on') || pop.querySelector('[data-h]')).focus({ preventScroll: true });
}

/** Convierte los campos de fecha-hora que haya en el elemento (y los que se agreguen después). */
export function activarFechaHora24(root = document.body) {
  root.querySelectorAll('input[type="datetime-local"]').forEach(convertirFechaHora);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches?.('input[type="datetime-local"]')) convertirFechaHora(n);
    n.querySelectorAll?.('input[type="datetime-local"]').forEach(convertirFechaHora);
  }))).observe(root, { childList: true, subtree: true });
}
/** true si todas las horas del formulario están en formato 24 h válido. */
export function horasValidas(form) {
  const mal = [...form.querySelectorAll('.dt24-h')].find((h) => (h.value ? !HORA_24.test(h.value) : h.required));
  if (mal) { mal.focus(); toast('Ingrese la hora en formato de 24 horas (HH:MM, de 00:00 a 23:59).', true); return false; }
  return true;
}
