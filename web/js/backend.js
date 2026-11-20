// "Servidor" en el navegador: mismas rutas que la API original, pero los datos viven en SharePoint.
//  - indice.json        -> operaciones (resumen), maestro de transportistas y roles de usuario
//  - op-<id>.json       -> datos completos de una operación (viajes, unidades, reportes, etc.)
// Cada escritura usa el eTag del archivo: si otro usuario guardó antes, se recarga y se reintenta.
import * as C from './calc.js?v=__V__';
import * as G from './graph.js?v=__V__';
import * as X from './excel.js?v=__V__';
import * as P from './pdf.js?v=__V__';

const INDICE = 'indice.json';
const opFile = (id) => `op-${id}.json`;
const cache = new Map(); // nombre -> { data, etag, at }
const FRESCO_MS = 10000;
let yo = null; // { nombre, email, rol }

const err = (status, msg) => Object.assign(new Error(msg), { status });
const N = (v) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
const S = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const clon = (o) => JSON.parse(JSON.stringify(o));
const ahora = () => C.fmtDT(Date.now() - new Date().getTimezoneOffset() * 60000, true);

function indiceVacio() { return { version: 1, seq_op: 0, seq_t: 0, operaciones: [], transportistas: [], usuarios: [] }; }
function opVacia() { return { operacion: null, op_transportistas: [], unidades: [], viajes: [], reportes: [], etapas: [], seq: 0, historial: [] }; }

async function leer(nombre, forzar = false) {
  const c = cache.get(nombre);
  if (c && !forzar && Date.now() - c.at < FRESCO_MS) return c.data;
  const { data, etag } = await G.leerJSON(nombre);
  const d = nombre === INDICE ? { ...indiceVacio(), ...(data || {}) } : data;
  cache.set(nombre, { data: d, etag, at: Date.now() });
  return d;
}

/** Aplica fn(datos) y guarda; reintenta si hubo un cambio concurrente. */
async function mutar(nombre, fn) {
  for (let intento = 0; intento < 5; intento++) {
    if (intento > 0 || !cache.has(nombre)) await leer(nombre, true);
    const c = cache.get(nombre);
    if (c.data === null) throw err(404, 'La operación ya no existe');
    const d = clon(c.data);
    const resultado = await fn(d);
    try {
      const etag = await G.guardarJSON(nombre, d, c.etag);
      cache.set(nombre, { data: d, etag, at: Date.now() });
      return resultado;
    } catch (e) {
      if (e.status !== 412) throw e;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
    }
  }
  throw err(409, 'Otro usuario está guardando cambios al mismo tiempo. Intente de nuevo.');
}

function historial(D, accion, detalle) {
  D.historial = D.historial || [];
  D.historial.push({ en: ahora(), por: yo?.email, accion, detalle });
  if (D.historial.length > 1000) D.historial = D.historial.slice(-1000);
}

/* ---------------- sesión y roles ---------------- */
export async function iniciarSesion() {
  const u = await G.yo();
  const I = await leer(INDICE, true);
  const reg = (I.usuarios || []).find((x) => x.email === u.email);
  // Mientras no haya usuarios configurados, todos son administradores (arranque).
  const rol = !I.usuarios?.length ? 'admin' : reg ? (reg.activo === false ? null : reg.rol) : (I.rol_por_defecto || 'lector');
  if (!rol) throw err(403, 'Su usuario está desactivado en Control de Unidades. Contacte al administrador.');
  yo = { id: u.email, usuario: u.email, nombre: reg?.nombre || u.nombre, email: u.email, rol };
  return yo;
}
export const usuarioActual = () => yo;
export function cerrarSesion() { yo = null; cache.clear(); G.logout(); }
const exige = (...roles) => { if (!yo) throw err(401, 'Sesión no iniciada'); if (!roles.includes(yo.rol)) throw err(403, 'No tiene permisos para esta acción'); };
const ESCRIBE = () => exige('admin', 'operador');
const ADMIN = () => exige('admin');

/* ---------------- carga calculada ---------------- */
async function datosOp(id) {
  const D = await leer(opFile(id));
  if (!D?.operacion) throw err(404, 'Operación no encontrada');
  return D;
}
function nombreT(T, id) { return T.find((t) => t.id === id)?.nombre_comercial ?? null; }
async function cargar(id) {
  const [D, I] = [await datosOp(id), await leer(INDICE)];
  const op = D.operacion;
  const raw = D.viajes.map((v) => ({ ...v, operacion_id: op.id, transportista_nombre: nombreT(I.transportistas, v.transportista_id) }));
  const viajes = C.enriquecerViajes(raw, op, D.reportes);
  const embarque = C.tablaEmbarque(op, D.reportes, D.etapas);
  return { D, I, op, viajes, embarque };
}
const participantes = (D, I) => D.op_transportistas.map((p) => {
  const t = I.transportistas.find((x) => x.id === p.transportista_id) || {};
  return { ...p, operacion_id: D.operacion.id, ruc: t.ruc, razon_social: t.razon_social, nombre_comercial: t.nombre_comercial, contacto: t.contacto, telefono: t.telefono, emails: t.emails };
}); // mismo orden que la hoja TRANSPORTISTAS del Excel (orden de registro)
const unidadesDe = (D, I) => D.unidades.map((u) => ({ ...u, transportista_nombre: nombreT(I.transportistas, u.transportista_id) }))
  .sort((a, b) => String(a.transportista_nombre).localeCompare(String(b.transportista_nombre)) || String(a.ap_paterno).localeCompare(String(b.ap_paterno)));

/** Mantiene el resumen de la operación en el índice. */
async function syncIndice(D) {
  const o = D.operacion;
  const res = { id: o.id, nave: o.nave, orden: o.orden, cliente: o.cliente, producto: o.producto, eta: o.eta, fecha_inicio: o.fecha_inicio,
    tn_programadas: o.tn_programadas, estado: o.estado, n_viajes: D.viajes.length };
  const actual = (await leer(INDICE)).operaciones.find((x) => x.id === o.id);
  if (actual && JSON.stringify(actual) === JSON.stringify(res)) return;
  await mutar(INDICE, (I) => { I.operaciones = I.operaciones.filter((x) => x.id !== o.id); I.operaciones.push(res); });
}
async function mutarOp(id, fn) {
  let D2;
  const r = await mutar(opFile(id), async (D) => { const x = await fn(D); D2 = D; return x; });
  await syncIndice(D2);
  return r;
}

/* ---------------- operaciones ---------------- */
const OP_CAMPOS = ['nave', 'orden', 'manifiesto', 'dam', 'eta', 'cliente', 'producto', 'referencia', 'punto_salida', 'punto_llegada',
  'empresa', 'coordinador', 'fecha_inicio', 'tn_programadas', 'tn_embarque_programadas', 'tn_draft_sgs', 'params', 'estado'];
function opDesdeBody(b) {
  const o = {};
  for (const k of OP_CAMPOS) {
    if (!(k in b)) continue;
    if (k.startsWith('tn_')) o[k] = N(b[k]);
    else if (k === 'params') o[k] = typeof b[k] === 'string' ? b[k] : JSON.stringify(b[k] || {});
    else if (k === 'eta') o[k] = C.normDT(b[k], false);
    else if (k === 'fecha_inicio') o[k] = C.normDate(b[k]);
    else o[k] = S(b[k]);
  }
  return o;
}
async function crearOperacion(o, D = opVacia()) {
  const id = await mutar(INDICE, (I) => { I.seq_op = Math.max(I.seq_op || 0, ...I.operaciones.map((x) => x.id)) + 1; return I.seq_op; });
  D.operacion = { id, empresa: 'PACIFICO DESPACHOS S.A.C.', estado: 'EN CURSO', params: '{}', creado_en: ahora(), ...o, id };
  historial(D, 'crear_operacion', `${o.nave} / ${o.orden}`);
  const etag = await G.guardarJSON(opFile(id), D, null);
  cache.set(opFile(id), { data: D, etag, at: Date.now() });
  await syncIndice(D);
  return D.operacion;
}

/* ---------------- viajes ---------------- */
function viajeDesdeBody(b, D) {
  const placa = C.normPlaca(b.placa);
  const despacho_en = C.normDT(b.despacho_en);
  const ingreso_en = C.normDT(b.ingreso_en);
  let transportista_id = N(b.transportista_id);
  if (!transportista_id && placa) transportista_id = D.unidades.find((u) => u.tracto === placa || u.plataforma === placa)?.transportista_id || null;
  return {
    transportista_id, placa, fecha_despacho: C.normDate(b.fecha_despacho) || (despacho_en ? despacho_en.slice(0, 10) : null),
    jornada_despacho: S(b.jornada_despacho) || C.jornadaDe(despacho_en), despacho_en, guia: S(b.guia), peso_origen: N(b.peso_origen),
    fecha_recepcion: C.normDate(b.fecha_recepcion) || (ingreso_en ? ingreso_en.slice(0, 10) : null),
    jornada_recepcion: S(b.jornada_recepcion) || C.jornadaDe(ingreso_en), ticket: S(b.ticket), peso_destino: N(b.peso_destino),
    ingreso_en, salida_en: C.normDT(b.salida_en), rep_despacho: N(b.rep_despacho), rep_acopio: N(b.rep_acopio), observacion: S(b.observacion),
  };
}
function validarViaje(v, D, id) {
  if (!v.placa) return 'La placa es obligatoria';
  if (!v.fecha_despacho) return 'La fecha de despacho es obligatoria';
  if (v.peso_origen !== null && (v.peso_origen < 0 || v.peso_origen > 80)) return 'Peso de origen fuera de rango (0 - 80 TN)';
  if (v.peso_destino !== null && (v.peso_destino < 0 || v.peso_destino > 80)) return 'Peso de destino fuera de rango (0 - 80 TN)';
  if (v.ticket && v.ticket !== '-' && v.peso_destino === null) return 'Ingrese el peso de destino del ticket';
  if (v.ingreso_en && v.salida_en && C.toMs(v.salida_en) < C.toMs(v.ingreso_en)) return 'La hora de salida es anterior a la de ingreso';
  if (v.guia && D.viajes.some((x) => x.guia === v.guia && x.id !== id)) return 'Ya existe un viaje con esa guía de remisión';
  return null;
}

/* ---------------- router ---------------- */
const rutas = [];
const ruta = (m, patron, fn) => rutas.push({ m, re: new RegExp(`^${patron.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });
let opActualId = null;
export const setOpActual = (id) => { opActualId = id; };

ruta('GET', '/me', () => yo);
ruta('GET', '/catalogos', () => ({ jornadas: C.JORNADAS, rangos: C.RANGOS, status: Object.values(C.STATUS) }));

ruta('GET', '/operaciones', async () => [...(await leer(INDICE, true)).operaciones].sort((a, b) => b.id - a.id));
ruta('GET', '/operaciones/:id', async ({ id }) => (await datosOp(id)).operacion);
ruta('POST', '/operaciones', async (p, b) => {
  ESCRIBE();
  const o = opDesdeBody(b);
  if (!o.nave || !o.orden) throw err(400, 'Nave y orden son obligatorios');
  o.tn_programadas = o.tn_programadas || 0;
  return crearOperacion(o);
});
ruta('PUT', '/operaciones/:id', async ({ id }, b) => {
  ESCRIBE();
  return mutarOp(id, (D) => { Object.assign(D.operacion, opDesdeBody(b)); historial(D, 'editar_operacion', null); return D.operacion; });
});
ruta('DELETE', '/operaciones/:id', async ({ id }) => {
  ADMIN();
  await G.eliminarArchivo(opFile(id));
  cache.delete(opFile(id));
  await mutar(INDICE, (I) => { I.operaciones = I.operaciones.filter((x) => x.id !== Number(id)); });
  return { ok: true };
});

ruta('GET', '/operaciones/:id/tablero', async ({ id }) => {
  const { D, I, op, viajes, embarque } = await cargar(id);
  const unidades = unidadesDe(D, I);
  return {
    operacion: op, totales: C.totales(viajes, op, embarque), preacopio: C.preacopio(op),
    transportistas: C.resumenTransportistas(viajes, participantes(D, I), unidades), jornadas: C.resumenJornadas(viajes),
    unidades: C.resumenUnidades(viajes), tiempos: C.resumenTiempos(viajes),
    reportes_despacho: C.tablaReportes(viajes, op, D.reportes, 'despacho'), reportes_acopio: C.tablaReportes(viajes, op, D.reportes, 'acopio'),
    embarque, unidades_en_lista: unidades.length, ultimos: viajes.slice(-8).reverse(),
  };
});

ruta('GET', '/operaciones/:id/viajes', async ({ id }) => (await cargar(id)).viajes);
ruta('POST', '/operaciones/:id/viajes', async ({ id }, b) => {
  ESCRIBE();
  const vid = await mutarOp(id, (D) => {
    const v = viajeDesdeBody(b, D);
    const e = validarViaje(v, D, null); if (e) throw err(400, e);
    const nv = X.nuevoViaje(D, v, yo.email);
    D.viajes.push(nv);
    X.asegurarParticipacion(D, v.transportista_id);
    if (!nv.ticket) X.conciliar(D); // por si el ticket del puerto llegó antes que el despacho
    historial(D, 'crear_viaje', `${v.placa} ${v.guia || ''}`);
    return nv.id;
  });
  return (await cargar(id)).viajes.find((x) => x.id === vid);
});
ruta('PUT', '/viajes/:vid', async ({ vid }, b) => {
  ESCRIBE();
  await mutarOp(opActualId, (D) => {
    const cur = D.viajes.find((x) => x.id === Number(vid)); if (!cur) throw err(404, 'Viaje no encontrado');
    const v = viajeDesdeBody({ ...cur, ...b }, D);
    const e = validarViaje(v, D, cur.id); if (e) throw err(400, e);
    Object.assign(cur, v, { actualizado_por: yo.email, actualizado_en: ahora() });
    X.asegurarParticipacion(D, v.transportista_id);
    X.conciliar(D);
    historial(D, 'editar_viaje', cur.id);
  });
  return (await cargar(opActualId)).viajes.find((x) => x.id === Number(vid));
});
ruta('DELETE', '/viajes/:vid', async ({ vid }) => {
  ESCRIBE();
  await mutarOp(opActualId, (D) => {
    const cur = D.viajes.find((x) => x.id === Number(vid)); if (!cur) throw err(404, 'Viaje no encontrado');
    D.viajes = D.viajes.filter((x) => x !== cur);
    historial(D, 'eliminar_viaje', cur);
  });
  return { ok: true };
});
ruta('POST', '/operaciones/:id/recepcion', async ({ id }, b) => {
  ESCRIBE();
  const t = { placa: C.normPlaca(b.placa), ticket: S(b.ticket), peso: N(b.peso_destino), ingreso: C.normDT(b.ingreso_en), salida: C.normDT(b.salida_en) };
  if (!t.placa || !t.ticket) throw err(400, 'Placa y ticket son obligatorios');
  if (t.ticket !== '-' && (t.peso === null || t.peso <= 0 || t.peso > 80)) throw err(400, 'Peso neto inválido');
  const vid = await mutarOp(id, (D) => {
    const r = X.asignarTicket(D, t);
    if (!r) throw err(404, `La placa ${t.placa} no tiene viajes pendientes de descarga`);
    historial(D, 'recepcion', `${t.placa} ticket ${t.ticket}`);
    return r;
  });
  return (await cargar(id)).viajes.find((x) => x.id === vid);
});

/* transportistas */
const T_CAMPOS = ['ruc', 'razon_social', 'nombre_comercial', 'contacto', 'telefono', 'emails'];
ruta('GET', '/transportistas', async () => [...(await leer(INDICE)).transportistas].sort((a, b) => a.nombre_comercial.localeCompare(b.nombre_comercial)));
ruta('POST', '/transportistas', async (p, b) => {
  ESCRIBE();
  const o = Object.fromEntries(T_CAMPOS.map((k) => [k, S(b[k])]));
  if (!o.ruc || !o.razon_social || !o.nombre_comercial) throw err(400, 'RUC, razón social y nombre comercial son obligatorios');
  if (!/^\d{11}$/.test(o.ruc)) throw err(400, 'El RUC debe tener 11 dígitos');
  o.nombre_comercial = o.nombre_comercial.toUpperCase().replace(/\s+/g, '_');
  return mutar(INDICE, (I) => {
    if (I.transportistas.some((t) => t.ruc === o.ruc || t.nombre_comercial === o.nombre_comercial)) throw err(409, 'Ya existe un transportista con ese RUC o nombre comercial');
    I.seq_t = (I.seq_t || 0) + 1;
    const t = { id: I.seq_t, ...o }; I.transportistas.push(t); return t;
  });
});
ruta('PUT', '/transportistas/:tid', async ({ tid }, b) => {
  ESCRIBE();
  return mutar(INDICE, (I) => {
    const t = I.transportistas.find((x) => x.id === Number(tid)); if (!t) throw err(404, 'No encontrado');
    for (const k of T_CAMPOS) if (k in b) t[k] = S(b[k]);
    if (I.transportistas.some((x) => x !== t && (x.ruc === t.ruc || x.nombre_comercial === t.nombre_comercial))) throw err(409, 'RUC o nombre comercial duplicado');
    return t;
  });
});
ruta('DELETE', '/transportistas/:tid', async ({ tid }) => {
  ADMIN();
  const I = await leer(INDICE, true);
  for (const o of I.operaciones) {
    const D = await leer(opFile(o.id));
    const n = D?.viajes.filter((v) => v.transportista_id === Number(tid)).length || 0;
    if (n) throw err(409, `No se puede eliminar: tiene ${n} viajes en ${o.nave} / ${o.orden}`);
  }
  await mutar(INDICE, (X2) => { X2.transportistas = X2.transportistas.filter((t) => t.id !== Number(tid)); });
  return { ok: true };
});
ruta('GET', '/operaciones/:id/transportistas', async ({ id }) => participantes(await datosOp(id), await leer(INDICE)));
ruta('PUT', '/operaciones/:id/transportistas/:tid', async ({ id, tid }, b) => {
  ESCRIBE();
  await mutarOp(id, (D) => {
    X.asegurarParticipacion(D, Number(tid));
    const vueltas_manual = {};
    for (let i = 1; i <= C.N_VUELTAS; i++) { const v = N(b[`v${i}`]); if (v !== null) vueltas_manual[i] = v; }
    Object.assign(D.op_transportistas.find((p) => p.transportista_id === Number(tid)), {
      unidades_solicitadas: N(b.unidades_solicitadas) || 0, tn_prom_unidad: N(b.tn_prom_unidad) || 33, tn_asignadas: null, vueltas_manual,
      reporte_confirmado: b.reporte_confirmado ? 1 : 0, observacion: S(b.observacion),
    });
  });
  return { ok: true };
});
ruta('DELETE', '/operaciones/:id/transportistas/:tid', async ({ id, tid }) => {
  ESCRIBE();
  await mutarOp(id, (D) => { D.op_transportistas = D.op_transportistas.filter((p) => p.transportista_id !== Number(tid)); });
  return { ok: true };
});

/* unidades */
function unidadDesdeBody(b) {
  const up = (v) => (S(v) ? S(v).toUpperCase() : null);
  const o = { transportista_id: N(b.transportista_id), ap_paterno: up(b.ap_paterno), ap_materno: up(b.ap_materno), nombre1: up(b.nombre1),
    nombre2: up(b.nombre2), dni: S(b.dni), brevete: up(b.brevete), tracto: C.normPlaca(b.tracto) || null, plataforma: C.normPlaca(b.plataforma) || null };
  if (!o.tracto) throw err(400, 'La placa del tracto es obligatoria');
  if (o.dni && !/^\d{8}$/.test(o.dni)) throw err(400, 'El DNI debe tener 8 dígitos');
  return o;
}
ruta('GET', '/operaciones/:id/unidades', async ({ id }) => unidadesDe(await datosOp(id), await leer(INDICE)));
ruta('POST', '/operaciones/:id/unidades', async ({ id }, b) => {
  ESCRIBE();
  const o = unidadDesdeBody(b);
  return mutarOp(id, (D) => { D.seq = (D.seq || 0) + 1; D.unidades.push({ id: D.seq, ...o }); X.asegurarParticipacion(D, o.transportista_id); return { id: D.seq }; });
});
ruta('PUT', '/unidades/:uid', async ({ uid }, b) => {
  ESCRIBE();
  const o = unidadDesdeBody(b);
  await mutarOp(opActualId, (D) => { const u = D.unidades.find((x) => x.id === Number(uid)); if (!u) throw err(404, 'Unidad no encontrada'); Object.assign(u, o); X.asegurarParticipacion(D, o.transportista_id); });
  return { ok: true };
});
ruta('DELETE', '/unidades/:uid', async ({ uid }) => {
  ESCRIBE();
  await mutarOp(opActualId, (D) => { D.unidades = D.unidades.filter((x) => x.id !== Number(uid)); });
  return { ok: true };
});

/* reportes y etapas */
ruta('GET', '/operaciones/:id/reportes', async ({ id }) => {
  const { D, op, viajes, embarque } = await cargar(id);
  return { despacho: C.tablaReportes(viajes, op, D.reportes, 'despacho'), acopio: C.tablaReportes(viajes, op, D.reportes, 'acopio'), embarque };
});
ruta('POST', '/operaciones/:id/reportes', async ({ id }, b) => {
  ESCRIBE();
  if (!['despacho', 'acopio', 'embarque'].includes(b.tipo)) throw err(400, 'Tipo inválido');
  const inicio = C.normDT(b.inicio, false), fin = C.normDT(b.fin, false);
  if (!inicio) throw err(400, 'Fecha-hora de inicio obligatoria');
  if (fin && C.toMs(fin) <= C.toMs(inicio)) throw err(400, 'El fin debe ser posterior al inicio');
  await mutarOp(id, (D) => {
    const numero = N(b.numero) || Math.max(0, ...D.reportes.filter((r) => r.tipo === b.tipo).map((r) => r.numero)) + 1;
    if (D.reportes.some((r) => r.tipo === b.tipo && r.numero === numero)) throw err(409, `Ya existe el reporte ${numero}`);
    D.seq = (D.seq || 0) + 1;
    D.reportes.push({ id: D.seq, tipo: b.tipo, numero, inicio, fin, tn_acumulado: N(b.tn_acumulado), observacion: S(b.observacion) });
  });
  return { ok: true };
});
ruta('PUT', '/reportes/:rid', async ({ rid }, b) => {
  ESCRIBE();
  await mutarOp(opActualId, (D) => {
    const r = D.reportes.find((x) => x.id === Number(rid)); if (!r) throw err(404, 'No encontrado');
    const inicio = C.normDT(b.inicio ?? r.inicio, false), fin = C.normDT(b.fin, false);
    if (fin && C.toMs(fin) <= C.toMs(inicio)) throw err(400, 'El fin debe ser posterior al inicio');
    Object.assign(r, { inicio, fin, tn_acumulado: N(b.tn_acumulado), observacion: S(b.observacion) });
  });
  return { ok: true };
});
ruta('DELETE', '/reportes/:rid', async ({ rid }) => { ESCRIBE(); await mutarOp(opActualId, (D) => { D.reportes = D.reportes.filter((x) => x.id !== Number(rid)); }); return { ok: true }; });
const etapaBody = (b) => ({ nombre: S(b.nombre), inicio: C.normDT(b.inicio, false), fin: C.normDT(b.fin, false), observacion: S(b.observacion) });
ruta('POST', '/operaciones/:id/etapas', async ({ id }, b) => {
  ESCRIBE();
  if (!S(b.nombre)) throw err(400, 'Nombre de la etapa obligatorio (ej. 1ETB)');
  await mutarOp(id, (D) => { D.seq = (D.seq || 0) + 1; D.etapas.push({ id: D.seq, ...etapaBody(b) }); });
  return { ok: true };
});
ruta('PUT', '/etapas/:eid', async ({ eid }, b) => { ESCRIBE(); await mutarOp(opActualId, (D) => { Object.assign(D.etapas.find((x) => x.id === Number(eid)) || {}, etapaBody(b)); }); return { ok: true }; });
ruta('DELETE', '/etapas/:eid', async ({ eid }) => { ESCRIBE(); await mutarOp(opActualId, (D) => { D.etapas = D.etapas.filter((x) => x.id !== Number(eid)); }); return { ok: true }; });

/* importación */
const archivo = (form) => { const f = form?.get('archivo'); if (!f || !f.size) throw err(400, 'Adjunte un archivo Excel (.xlsx/.xlsm) o CSV'); return f; };
ruta('POST', '/importar/libro', async (p, b, form) => {
  ESCRIBE();
  const wb = await X.cargarLibro(archivo(form));
  const T0 = clon((await leer(INDICE, true)).transportistas);
  const { operacion, D, nuevosT, res } = X.importarLibro(wb, T0, yo.email);
  // Fusionar transportistas en el maestro y traducir ids provisionales
  const mapa = await mutar(INDICE, (I2) => {
    const m = {};
    for (const t of [...T0, ...nuevosT]) {
      let e = I2.transportistas.find((x) => x.ruc === t.ruc);
      if (!e) { I2.seq_t = (I2.seq_t || 0) + 1; e = { ...t, id: I2.seq_t }; I2.transportistas.push(e); }
      else Object.assign(e, { razon_social: t.razon_social || e.razon_social, nombre_comercial: t.nombre_comercial || e.nombre_comercial,
        contacto: t.contacto || e.contacto, telefono: t.telefono || e.telefono, emails: t.emails || e.emails });
      m[t.id] = e.id;
    }
    return m;
  });
  const tr = (id) => (id == null ? null : mapa[id] ?? id);
  D.op_transportistas.forEach((x) => { x.transportista_id = tr(x.transportista_id); });
  D.unidades.forEach((x) => { x.transportista_id = tr(x.transportista_id); });
  D.viajes.forEach((x) => { x.transportista_id = tr(x.transportista_id); });
  const op = await crearOperacion(operacion, D);
  return { ...res, operacion_id: op.id };
});
ruta('POST', '/operaciones/:id/importar/:tipo', async ({ id, tipo }, b, form) => {
  ESCRIBE();
  const wb = await X.cargarLibro(archivo(form));
  const I = await leer(INDICE);
  if (!['despachos', 'tickets', 'lista'].includes(tipo)) throw err(400, 'Tipo de importación inválido');
  return mutarOp(id, (D) => {
    const r = tipo === 'despachos' ? X.importarDespachos(D, I.transportistas, wb, yo.email) : tipo === 'tickets' ? X.importarTickets(D, wb) : X.importarLista(D, I.transportistas, wb);
    historial(D, `importar_${tipo}`, archivo(form).name);
    D.importaciones = [{ tipo, archivo: archivo(form).name, en: ahora(), por: yo.nombre || yo.email,
      resumen: { ...r, sin_viaje: r.sin_viaje?.length, errores: r.errores?.length, sin_transportista: r.sin_transportista?.length } },
    ...(D.importaciones || [])].slice(0, 50);
    return r;
  });
});

/* exportación (devuelve { blob, nombre }) */
const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
ruta('GET', '/operaciones/:id/exportar/detalle', async ({ id }) => {
  const { op, viajes, embarque } = await cargar(id);
  return { blob: await X.exportarDetalle(op, viajes, C.totales(viajes, op, embarque)), nombre: `DETALLE_${slug(op.nave)}_ORDEN_${slug(op.orden)}.xlsx` };
});
ruta('GET', '/operaciones/:id/exportar/transportista/:tid', async ({ id, tid }) => {
  const { op, viajes, I } = await cargar(id);
  const t = I.transportistas.find((x) => x.id === Number(tid)); if (!t) throw err(404, 'Transportista no encontrado');
  return { blob: await X.exportarTransportista(op, t, viajes.filter((v) => v.transportista_id === t.id)), nombre: `REPORTE_${slug(t.nombre_comercial)}_${slug(op.nave)}_${slug(op.orden)}.xlsx` };
});

/* estado del cruce HUACHO ↔ CSPCP */
ruta('GET', '/operaciones/:id/cruce', async ({ id }) => {
  const { D, viajes } = await cargar(id);
  const asignados = new Set(D.viajes.map((v) => v.ticket).filter(Boolean));
  const ult = (t) => (D.importaciones || []).find((x) => x.tipo === t) || null;
  return {
    viajes: D.viajes.length,
    con_guia: D.viajes.filter((v) => v.guia).length,
    tickets: (D.tickets || []).length,
    tickets_sin_viaje: (D.tickets || []).filter((t) => !asignados.has(t.ticket)),
    viajes_sin_ticket: viajes.filter((v) => v.status === 'FALTA DESCARGAR').map((v) => ({ nro: v.nro, placa: v.placa, guia: v.guia, peso_origen: v.peso_origen, despacho_en: v.despacho_en, transportista_nombre: v.transportista_nombre })),
    ultima_huacho: ult('despachos'), ultima_cspcp: ult('tickets'),
    importaciones: (D.importaciones || []).slice(0, 15),
  };
});

/* reporte por transportista */
async function grupoTransportista(id, tid) {
  const { op, viajes, I } = await cargar(id);
  const t = I.transportistas.find((x) => x.id === Number(tid));
  if (!t) throw err(404, 'Transportista no encontrado');
  return { op, t, viajes: viajes.filter((v) => v.transportista_id === t.id) };
}
async function todosTransportistas(id) {
  const { D, I, op, viajes } = await cargar(id);
  const grupos = participantes(D, I).map((p) => ({ t: I.transportistas.find((x) => x.id === p.transportista_id), viajes: viajes.filter((v) => v.transportista_id === p.transportista_id) }))
    .filter((g) => g.t && g.viajes.length);
  return { op, grupos };
}
ruta('GET', '/operaciones/:id/transportistas/:tid/reporte', async ({ id, tid }) => grupoTransportista(id, tid));
ruta('GET', '/operaciones/:id/exportar/detalle-pdf', async ({ id }) => {
  const { op, viajes, embarque } = await cargar(id);
  return { blob: await P.pdfDetalle(op, viajes, C.totales(viajes, op, embarque)), nombre: `DETALLE_${slug(op.nave)}_ORDEN_${slug(op.orden)}.pdf` };
});
ruta('GET', '/operaciones/:id/exportar/transportista-pdf/:tid', async ({ id, tid }) => {
  const { op, t, viajes } = await grupoTransportista(id, tid);
  return { blob: await P.pdfTransportista(op, t, viajes), nombre: `REPORTE_${slug(t.nombre_comercial)}_${slug(op.nave)}_${slug(op.orden)}.pdf` };
});
ruta('GET', '/operaciones/:id/exportar/transportistas', async ({ id }) => {
  const { op, grupos } = await todosTransportistas(id);
  if (!grupos.length) throw err(400, 'No hay transportistas con viajes');
  return { blob: await X.exportarTransportistas(op, grupos), nombre: `REPORTES_TRANSPORTISTAS_${slug(op.nave)}_${slug(op.orden)}.xlsx` };
});
ruta('GET', '/operaciones/:id/exportar/transportistas-pdf', async ({ id }) => {
  const { op, grupos } = await todosTransportistas(id);
  if (!grupos.length) throw err(400, 'No hay transportistas con viajes');
  return { blob: await P.pdfTransportistas(op, grupos), nombre: `REPORTES_TRANSPORTISTAS_${slug(op.nave)}_${slug(op.orden)}.pdf` };
});

/* usuarios (roles dentro de la app; el acceso real lo da SharePoint) */
ruta('GET', '/usuarios', async () => { ADMIN(); const I = await leer(INDICE, true); return { usuarios: I.usuarios || [], rol_por_defecto: I.rol_por_defecto || 'lector' }; });
ruta('POST', '/usuarios', async (p, b) => {
  ADMIN();
  const email = S(b.email)?.toLowerCase();
  if (!email || !email.includes('@')) throw err(400, 'Ingrese el correo de Microsoft 365 del usuario');
  if (!['admin', 'operador', 'lector'].includes(b.rol)) throw err(400, 'Rol inválido');
  await mutar(INDICE, (I) => {
    I.usuarios = I.usuarios || [];
    // Al registrar el primer usuario, el administrador actual queda registrado también para no perder el acceso.
    if (!I.usuarios.length && email !== yo.email) I.usuarios.push({ email: yo.email, nombre: yo.nombre, rol: 'admin', activo: true });
    if (I.usuarios.some((u) => u.email === email)) throw err(409, 'Ese usuario ya está registrado');
    I.usuarios.push({ email, nombre: S(b.nombre) || email, rol: b.rol, activo: true });
  });
  return { ok: true };
});
ruta('PUT', '/usuarios/:email', async ({ email }, b) => {
  ADMIN();
  email = decodeURIComponent(email);
  if (email === yo.email && (b.rol !== 'admin' || b.activo === false)) throw err(400, 'No puede quitarse a sí mismo el rol de administrador ni desactivarse');
  await mutar(INDICE, (I) => {
    const u = (I.usuarios || []).find((x) => x.email === email); if (!u) throw err(404, 'No encontrado');
    Object.assign(u, { nombre: S(b.nombre) || u.nombre, rol: b.rol || u.rol, activo: b.activo !== false });
  });
  return { ok: true };
});
ruta('PUT', '/usuarios-config', async (p, b) => {
  ADMIN();
  if (!['operador', 'lector'].includes(b.rol_por_defecto)) throw err(400, 'Rol inválido');
  await mutar(INDICE, (I) => { I.rol_por_defecto = b.rol_por_defecto; });
  return { ok: true };
});

/** Punto de entrada: igual a fetch('/api' + path). */
export async function request(path, { method = 'GET', body, form } = {}) {
  const p = path.split('?')[0];
  for (const r of rutas) {
    if (r.m !== method) continue;
    const m = p.match(r.re);
    if (m) return r.fn(m.groups || {}, body || {}, form);
  }
  throw err(404, 'Ruta no encontrada');
}
