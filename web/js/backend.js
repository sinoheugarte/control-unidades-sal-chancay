// "Servidor" en el navegador: mismas rutas que la API original, pero los datos viven en SharePoint.
//  - indice.json        -> operaciones (resumen), maestro de transportistas y roles de usuario
//  - op-<id>.json       -> datos completos de una operación (viajes, unidades, reportes, etc.)
// Cada escritura usa el eTag del archivo: si otro usuario guardó antes, se recarga y se reintenta.
import * as C from './calc.js?v=__V__';
import * as G from './graph.js?v=__V__';
import * as X from './excel.js?v=__V__';
import * as P from './pdf.js?v=__V__';

const INDICE = 'indice.json';
/**
 * Nombre de la operación, igual que el nombre del libro Excel:
 *   "REPORTE DE CONTROL UNIDADES SAL - MV TURBO S - ORDEN 2052"
 * Cada operación se guarda en SharePoint como "<ese nombre>.json".
 */
export function nombreReporte(o) {
  const limpio = (v) => String(v ?? '').toUpperCase().replace(/["*:<>?/\\|#%~&{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return `REPORTE DE CONTROL UNIDADES SAL - ${limpio(o.nave)} - ORDEN ${limpio(o.orden)}`;
}
const claveOp = (o) => `${String(o.nave ?? '').toUpperCase().replace(/\s+/g, ' ').trim()}|${String(o.orden ?? '').toUpperCase().trim()}`;
async function opFile(id) {
  const e = (await leer(INDICE)).operaciones.find((x) => x.id === Number(id));
  return e?.archivo || `op-${id}.json`;
}
function verificarDuplicado(I, o, idActual = null) {
  const d = I.operaciones.find((x) => x.id !== Number(idActual) && claveOp(x) === claveOp(o));
  if (d) throw err(409, `Ya existe la operación ${String(o.nave).toUpperCase()} - ORDEN ${String(o.orden).toUpperCase()}. Selecciónela en el listado; para agregarle datos use Importar datos (REPORTE HUACHO / REPORTE CSPCP).`);
}
/** Renombra el archivo de la operación en SharePoint si su nave/orden cambió (o si tiene un nombre antiguo). */
async function asegurarNombreArchivo(id) {
  const I = await leer(INDICE, true);
  const e = I.operaciones.find((x) => x.id === Number(id));
  if (!e) return;
  const viejo = e.archivo || `op-${id}.json`;
  const nuevo = `${nombreReporte(e)}.json`;
  if (viejo === nuevo) return;
  await G.renombrarArchivo(viejo, nuevo);
  if (cache.has(viejo)) { cache.set(nuevo, cache.get(viejo)); cache.delete(viejo); }
  await mutar(INDICE, (I2) => { const x = I2.operaciones.find((y) => y.id === Number(id)); if (x) { x.archivo = nuevo; x.nombre = nombreReporte(x); } });
}
/** Migra operaciones creadas con el nombre interno antiguo (op-N.json) al nombre del reporte. */
async function migrarNombres() {
  const I = await leer(INDICE);
  for (const o of I.operaciones) {
    if (o.archivo === `${nombreReporte(o)}.json`) continue;
    try { await asegurarNombreArchivo(o.id); } catch (e) { console.warn('No se pudo renombrar', o, e.message); }
  }
}
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
  // ¿Es un usuario transportista? Tiene su propia carpeta del portal con perfil.json
  let perfil = null;
  try { perfil = (await G.leerJSON(`${portalDir(u.email)}/perfil.json`)).data; } catch { perfil = null; }
  let I;
  try { I = await leer(INDICE, true); } catch (e) {
    if (!perfil) throw err(e.status || 403, 'Su cuenta no tiene acceso a Control de Unidades. Contacte al administrador.');
  }
  if (perfil && (!I || (I.usuarios || []).some((x) => x.email === u.email && x.rol === 'transportista'))) {
    if (perfil.activo === false) throw err(403, 'Su usuario está desactivado. Contacte a Pacífico Despachos.');
    yo = { id: u.email, usuario: u.email, nombre: perfil.nombre || u.nombre, email: u.email, rol: 'transportista', transportista: perfil.transportista };
    return yo;
  }
  const reg = (I.usuarios || []).find((x) => x.email === u.email);
  // Mientras no haya usuarios configurados, todos son administradores (arranque).
  const rol = !I.usuarios?.length ? 'admin' : reg ? (reg.activo === false ? null : reg.rol) : (I.rol_por_defecto || 'lector');
  if (!rol) throw err(403, 'Su usuario está desactivado en Control de Unidades. Contacte al administrador.');
  if (rol === 'transportista') throw err(403, 'Su acceso de transportista aún no está listo. Pida al administrador que use "Republicar portal".');
  yo = { id: u.email, usuario: u.email, nombre: reg?.nombre || u.nombre, email: u.email, rol };
  if (rol !== 'lector') await migrarNombres();
  return yo;
}
export const usuarioActual = () => yo;
export function cerrarSesion() { yo = null; cache.clear(); G.logout(); }
const exige = (...roles) => { if (!yo) throw err(401, 'Sesión no iniciada'); if (!roles.includes(yo.rol)) throw err(403, 'No tiene permisos para esta acción'); };
const ESCRIBE = () => exige('admin', 'operador');
const ADMIN = () => exige('admin');

/* ---------------- carga calculada ---------------- */
async function datosOp(id) {
  const D = await leer(await opFile(id));
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
/** Resumen para el RESUMEN ANUAL: calculado de los viajes, o el importado de un libro de resumen histórico. */
function calcularResumen(D, I) {
  const fechas = (r) => r;
  if (!D.viajes.length && D.resumen_manual) return fechas(D.resumen_manual);
  const raw = D.viajes.map((v) => ({ ...v, transportista_nombre: nombreT(I.transportistas, v.transportista_id) }));
  const vs = C.enriquecerViajes(raw, D.operacion, D.reportes);
  return fechas(C.resumenOperacion(vs, D.operacion, participantes(D, I), unidadesDe(D, I)));
}
async function syncIndice(D) {
  const o = D.operacion;
  const I0 = await leer(INDICE);
  const actual = I0.operaciones.find((x) => x.id === o.id);
  const fechas = D.viajes.map((v) => v.fecha_despacho).filter(Boolean).sort();
  const resumen = calcularResumen(D, I0);
  const res = { id: o.id, nombre: nombreReporte(o), archivo: actual?.archivo || `op-${o.id}.json`, nave: o.nave, orden: o.orden, cliente: o.cliente,
    producto: o.producto, dam: o.dam || null, manifiesto: o.manifiesto || null, referencia: o.referencia || null, eta: o.eta, fecha_inicio: o.fecha_inicio,
    tn_programadas: o.tn_programadas, estado: o.estado, n_viajes: D.viajes.length, anio: o.anio || null, origen: o.origen || null,
    finalizada_en: o.finalizada_en || null, resumen,
    primer_viaje: fechas[0] || null, ultimo_viaje: fechas[fechas.length - 1] || null, actualizado_en: ahora(), actualizado_por: yo?.nombre || yo?.email || null };
  const sinMarca = ({ actualizado_en, actualizado_por, ...r }) => r; // eslint-disable-line no-unused-vars
  if (actual && JSON.stringify(sinMarca(actual)) === JSON.stringify(sinMarca(res))) return;
  await mutar(INDICE, (I) => { I.operaciones = I.operaciones.filter((x) => x.id !== o.id); I.operaciones.push(res); });
}
async function mutarOp(id, fn) {
  let D2;
  const r = await mutar(await opFile(id), async (D) => { const x = await fn(D); D2 = D; return x; });
  await syncIndice(D2);
  try { await publicarPortalOp(D2); } catch (e) { console.warn('Portal transportistas:', e.message); }
  return r;
}

/* ---------------- operaciones ---------------- */
const OP_CAMPOS = ['nave', 'orden', 'manifiesto', 'dam', 'eta', 'cliente', 'producto', 'referencia', 'punto_salida', 'punto_llegada',
  'empresa', 'coordinador', 'fecha_inicio', 'tn_programadas', 'tn_embarque_programadas', 'tn_draft_sgs', 'params', 'estado', 'anio', 'inicio_acopio', 'fin_acopio'];
function opDesdeBody(b) {
  const o = {};
  for (const k of OP_CAMPOS) {
    if (!(k in b)) continue;
    if (k.startsWith('tn_') || k === 'anio') o[k] = N(b[k]);
    else if (k === 'params') o[k] = typeof b[k] === 'string' ? b[k] : JSON.stringify(b[k] || {});
    else if (k === 'eta') o[k] = C.normDT(b[k], false);
    else if (['fecha_inicio', 'inicio_acopio', 'fin_acopio'].includes(k)) o[k] = C.normDate(b[k]);
    else o[k] = S(b[k]);
  }
  if (o.nave) o.nave = o.nave.toUpperCase().replace(/\s+/g, ' ');
  if (o.orden) o.orden = o.orden.toUpperCase();
  return o;
}
async function crearOperacion(o, D = opVacia()) {
  const archivo = `${nombreReporte(o)}.json`;
  // Reserva el id y registra la operación en el índice (falla si la nave + orden ya existe)
  const id = await mutar(INDICE, (I) => {
    verificarDuplicado(I, o);
    I.seq_op = Math.max(I.seq_op || 0, ...I.operaciones.map((x) => x.id)) + 1;
    I.operaciones.push({ id: I.seq_op, nombre: nombreReporte(o), archivo, nave: o.nave, orden: o.orden, estado: 'EN CURSO', n_viajes: 0 });
    return I.seq_op;
  });
  D.operacion = { id, empresa: 'PACIFICO DESPACHOS S.A.C.', estado: 'EN CURSO', params: '{}', creado_en: ahora(), ...o, id };
  historial(D, 'crear_operacion', `${o.nave} / ${o.orden}`);
  try {
    const etag = await G.guardarJSON(archivo, D, null);
    cache.set(archivo, { data: D, etag, at: Date.now() });
  } catch (e) {
    await mutar(INDICE, (I) => { I.operaciones = I.operaciones.filter((x) => x.id !== id); });
    throw e;
  }
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
  const cambios = opDesdeBody(b);
  if (('nave' in cambios && !cambios.nave) || ('orden' in cambios && !cambios.orden)) throw err(400, 'Nave y orden son obligatorios');
  const I = await leer(INDICE, true);
  const actual = I.operaciones.find((x) => x.id === Number(id)) || {};
  verificarDuplicado(I, { nave: cambios.nave ?? actual.nave, orden: cambios.orden ?? actual.orden }, id);
  const op = await mutarOp(id, (D) => { Object.assign(D.operacion, cambios); historial(D, 'editar_operacion', null); return D.operacion; });
  await asegurarNombreArchivo(id);
  return op;
});
ruta('DELETE', '/operaciones/:id', async ({ id }) => {
  ADMIN();
  const archivo = await opFile(id);
  await G.eliminarArchivo(archivo);
  cache.delete(archivo);
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
    embarque, unidades_en_lista: unidades.length, ultimos: viajes.slice(-8).reverse(), resumen: calcularResumen(D, I),
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
    const D = await leer(await opFile(o.id));
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
ruta('GET', '/operaciones/:id/exportar/detalle', async ({ id }) => {
  const { op, viajes, embarque } = await cargar(id);
  return { blob: await X.exportarDetalle(op, viajes, C.totales(viajes, op, embarque)), nombre: `${nombreReporte(op)} - DETALLE TRANSPORTE.xlsx` };
});
ruta('GET', '/operaciones/:id/exportar/transportista/:tid', async ({ id, tid }) => {
  const { op, viajes, I } = await cargar(id);
  const t = I.transportistas.find((x) => x.id === Number(tid)); if (!t) throw err(404, 'Transportista no encontrado');
  return { blob: await X.exportarTransportista(op, t, viajes.filter((v) => v.transportista_id === t.id)), nombre: `${nombreReporte(op)} - ${t.nombre_comercial}.xlsx` };
});

/* ================= FINALIZAR OPERACIÓN ================= */
const escH = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function correoHTML(op, res, enlaces, urlApp, mensaje) {
  const nf2 = (v) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
  const f = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
  const boton = (href, txt, color) => `<a href="${escH(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;margin:4px 6px 4px 0">${txt}</a>`;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#17212f;max-width:640px">
  <div style="background:#1F4E79;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0"><div style="font-size:13px;opacity:.85">${escH((op.empresa || '').trim())}</div>
  <div style="font-size:20px;font-weight:700;margin-top:4px">Operación finalizada: ${escH(op.nave)} · Orden ${escH(op.orden)}</div></div>
  <div style="border:1px solid #e2e7ee;border-top:0;padding:18px 22px;border-radius:0 0 8px 8px">
  ${mensaje ? `<p>${escH(mensaje).replace(/\n/g, '<br>')}</p>` : '<p>Se informa que la siguiente operación de acopio ha sido finalizada.</p>'}
  <table style="border-collapse:collapse;font-size:14px;margin:8px 0 14px">
   <tr><td style="padding:4px 14px 4px 0;color:#5e6b7c">Cliente</td><td><strong>${escH(op.cliente || '—')}</strong></td></tr>
   <tr><td style="padding:4px 14px 4px 0;color:#5e6b7c">Acopio</td><td>${f(res?.inicio_acopio)} al ${f(res?.fin_acopio)}</td></tr>
   <tr><td style="padding:4px 14px 4px 0;color:#5e6b7c">TN despachadas (Huacho)</td><td>${nf2(res?.tn_despacho)}</td></tr>
   <tr><td style="padding:4px 14px 4px 0;color:#5e6b7c">TN acopiadas (CSPCP)</td><td><strong>${nf2(res?.tn_acopio)}</strong></td></tr>
   <tr><td style="padding:4px 14px 4px 0;color:#5e6b7c">Viajes</td><td>${res?.viajes ?? '—'}</td></tr></table>
  <p style="margin:6px 0">${boton(urlApp, 'Ingresar a la aplicación', '#1F4E79')}</p>
  <p style="margin:6px 0">${enlaces.pptx ? boton(enlaces.pptx, 'Presentación PowerPoint', '#C55A11') : ''}${enlaces.html ? boton(enlaces.html, 'Presentación HTML', '#2E75B6') : ''}${enlaces.video ? boton(enlaces.video, 'Video', '#1D7A4F') : ''}</p>
  <p style="font-size:12px;color:#5e6b7c">Ingrese con su usuario corporativo de Microsoft 365 asignado. Los archivos están guardados en SharePoint (sitio PacificoTP).</p>
  </div></div>`;
}
const carpetaPresentacion = (op) => `Presentaciones/${nombreReporte(op)}`;

ruta('GET', '/finalizacion/destinatarios', async () => {
  ESCRIBE();
  const I = await leer(INDICE, true);
  return { predeterminados: I.finalizacion?.destinatarios || [], usuarios: (I.usuarios || []).filter((u) => u.rol !== 'transportista' && u.activo !== false).map((u) => ({ email: u.email, nombre: u.nombre, rol: u.rol })) };
});

/**
 * body: { destinatarios: [correos], mensaje, guardar, archivos: [{ clave: 'pptx'|'html'|'video', nombre, blob }], progreso(texto) }
 * Sube los archivos a SharePoint, marca la operación como FINALIZADA y envía el correo con los enlaces.
 */
ruta('POST', '/operaciones/:id/finalizar', async ({ id }, b) => {
  ESCRIBE();
  const D0 = await datosOp(id);
  const op = D0.operacion;
  const para = [...new Set((b.destinatarios || []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
  const prog = b.progreso || (() => {});
  const enlaces = {};
  for (const a of b.archivos || []) {
    prog(`Subiendo ${a.nombre} a SharePoint…`);
    const ruta2 = `${carpetaPresentacion(op)}/${a.nombre}`;
    await G.subirArchivo(ruta2, a.blob);
    enlaces[a.clave] = await G.crearEnlace(ruta2);
  }
  prog('Marcando la operación como FINALIZADA…');
  const urlApp = `${G.appUrl()}#/tablero?op=${op.id}`;
  await mutarOp(id, (D) => {
    Object.assign(D.operacion, { estado: 'FINALIZADA', finalizada_en: ahora(), finalizada_por: yo.nombre || yo.email,
      presentacion: { ...(D.operacion.presentacion || {}), ...enlaces, carpeta: carpetaPresentacion(op), generada_en: ahora() } });
    historial(D, 'finalizar', { destinatarios: para });
  });
  if (b.guardar && para.length) await mutar(INDICE, (I) => { I.finalizacion = { ...(I.finalizacion || {}), destinatarios: para }; });
  const correo = { para, ok: false, error: null };
  if (para.length) {
    try {
      prog('Enviando el correo…');
      const D = await datosOp(id);
      await G.asegurarPermisoCorreo();
      await G.enviarCorreo({ para, asunto: `Operación finalizada: ${op.nave} · Orden ${op.orden} — ${nombreReporte(op)}`,
        html: correoHTML(D.operacion, calcularResumen(D, await leer(INDICE)), D.operacion.presentacion || {}, urlApp, b.mensaje) });
      correo.ok = true;
    } catch (e) { correo.error = e.message; }
    await mutarOp(id, (D) => { D.operacion.ultimo_correo = { en: ahora(), por: yo.email, para, ok: correo.ok, error: correo.error }; });
  }
  const D = await datosOp(id);
  return { enlaces: D.operacion.presentacion, correo, urlApp,
    mailto: `mailto:${para.join(';')}?subject=${encodeURIComponent(`Operación finalizada: ${op.nave} · Orden ${op.orden}`)}&body=${encodeURIComponent(
      `Se informa que la operación ${op.nave} · Orden ${op.orden} ha sido finalizada.\n\nIngresar a la aplicación: ${urlApp}\n${Object.entries(D.operacion.presentacion || {}).filter(([k]) => ['pptx', 'html', 'video'].includes(k)).map(([k, v]) => `${{ pptx: 'Presentación PowerPoint', html: 'Presentación HTML', video: 'Video' }[k]}: ${v}`).join('\n')}`)}` };
});
ruta('POST', '/operaciones/:id/reabrir', async ({ id }) => {
  ADMIN();
  await mutarOp(id, (D) => { D.operacion.estado = 'EN CURSO'; historial(D, 'reabrir', null); });
  return { ok: true };
});

/* ================= RESUMEN ANUAL ================= */
ruta('GET', '/resumen-anual', async () => {
  let I = await leer(INDICE, true);
  // Completa el resumen de operaciones guardadas antes de esta versión
  for (const o of I.operaciones.filter((x) => !x.resumen)) {
    try { const D = await leer(await opFile(o.id)); if (D?.operacion) await syncIndice(D); } catch (e) { console.warn('resumen', o.id, e.message); }
  }
  I = await leer(INDICE);
  return I.operaciones.map((o) => ({ ...o, anio_calc: C.anioOperacion(o) }));
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
  return { blob: await P.pdfDetalle(op, viajes, C.totales(viajes, op, embarque)), nombre: `${nombreReporte(op)} - DETALLE TRANSPORTE.pdf` };
});
ruta('GET', '/operaciones/:id/exportar/transportista-pdf/:tid', async ({ id, tid }) => {
  const { op, t, viajes } = await grupoTransportista(id, tid);
  return { blob: await P.pdfTransportista(op, t, viajes), nombre: `${nombreReporte(op)} - ${t.nombre_comercial}.pdf` };
});
ruta('GET', '/operaciones/:id/exportar/transportistas', async ({ id }) => {
  const { op, grupos } = await todosTransportistas(id);
  if (!grupos.length) throw err(400, 'No hay transportistas con viajes');
  return { blob: await X.exportarTransportistas(op, grupos), nombre: `${nombreReporte(op)} - TRANSPORTISTAS.xlsx` };
});
ruta('GET', '/operaciones/:id/exportar/transportistas-pdf', async ({ id }) => {
  const { op, grupos } = await todosTransportistas(id);
  if (!grupos.length) throw err(400, 'No hay transportistas con viajes');
  return { blob: await P.pdfTransportistas(op, grupos), nombre: `${nombreReporte(op)} - TRANSPORTISTAS.pdf` };
});

/* usuarios (roles dentro de la app; el acceso real lo da SharePoint) */
ruta('GET', '/usuarios', async () => { ADMIN(); const I = await leer(INDICE, true); return { usuarios: I.usuarios || [], rol_por_defecto: I.rol_por_defecto || 'lector' }; });
ruta('POST', '/usuarios', async (p, b) => {
  ADMIN();
  const email = S(b.email)?.toLowerCase();
  if (!email || !email.includes('@')) throw err(400, 'Ingrese el correo de Microsoft 365 del usuario');
  if (!['admin', 'operador', 'lector', 'transportista'].includes(b.rol)) throw err(400, 'Rol inválido');
  const tid = b.rol === 'transportista' ? N(b.transportista_id) : null;
  if (b.rol === 'transportista' && !(await leer(INDICE)).transportistas.some((t) => t.id === tid)) throw err(400, 'Seleccione la empresa de transporte del usuario');
  await mutar(INDICE, (I) => {
    I.usuarios = I.usuarios || [];
    // Al registrar el primer usuario, el administrador actual queda registrado también para no perder el acceso.
    if (!I.usuarios.length && email !== yo.email) I.usuarios.push({ email: yo.email, nombre: yo.nombre, rol: 'admin', activo: true });
    if (I.usuarios.some((u) => u.email === email)) throw err(409, 'Ese usuario ya está registrado');
    I.usuarios.push({ email, nombre: S(b.nombre) || email, rol: b.rol, transportista_id: tid, activo: true });
  });
  if (b.rol === 'transportista') return activarPortal(email);
  return { ok: true };
});
ruta('PUT', '/usuarios/:email', async ({ email }, b) => {
  ADMIN();
  email = decodeURIComponent(email);
  if (email === yo.email && (b.rol !== 'admin' || b.activo === false)) throw err(400, 'No puede quitarse a sí mismo el rol de administrador ni desactivarse');
  if (b.rol && !['admin', 'operador', 'lector', 'transportista'].includes(b.rol)) throw err(400, 'Rol inválido');
  const antes = ((await leer(INDICE, true)).usuarios || []).find((x) => x.email === email);
  if (!antes) throw err(404, 'No encontrado');
  await mutar(INDICE, (I) => {
    const u = (I.usuarios || []).find((x) => x.email === email); if (!u) throw err(404, 'No encontrado');
    const rol = b.rol || u.rol;
    Object.assign(u, { nombre: S(b.nombre) || u.nombre, rol, activo: b.activo !== false,
      transportista_id: rol === 'transportista' ? (N(b.transportista_id) ?? u.transportista_id) : null });
  });
  const ahoraU = ((await leer(INDICE)).usuarios || []).find((x) => x.email === email);
  const eraPortal = antes.rol === 'transportista' && antes.activo !== false;
  const esPortal = ahoraU.rol === 'transportista' && ahoraU.activo !== false;
  if (eraPortal && (!esPortal || antes.transportista_id !== ahoraU.transportista_id)) await desactivarPortal(email);
  if (esPortal) return activarPortal(email);
  return { ok: true };
});
ruta('PUT', '/usuarios-config', async (p, b) => {
  ADMIN();
  if (!['operador', 'lector'].includes(b.rol_por_defecto)) throw err(400, 'Rol inválido');
  await mutar(INDICE, (I) => { I.rol_por_defecto = b.rol_por_defecto; });
  return { ok: true };
});

/* ================= PORTAL DE TRANSPORTISTAS =================
   Cada usuario transportista tiene su carpeta "Portal/<correo>/" con permiso de SÓLO LECTURA
   para él. La app publica ahí únicamente sus viajes y unidades, así no puede ver datos de otros
   transportistas ni siquiera entrando directamente a SharePoint.
     Portal/<correo>/perfil.json            datos del usuario y su empresa
     Portal/<correo>/operaciones.json       operaciones en las que participa
     Portal/<correo>/<nombre reporte>.json  sus viajes y unidades de esa operación  */
function portalDir(email) { return `Portal/${String(email).toLowerCase()}`; }
const publicado = new Map(); // archivo -> JSON publicado en esta sesión (evita reescrituras)

const CAMPOS_OP_PORTAL = ['id', 'nave', 'orden', 'cliente', 'producto', 'dam', 'referencia', 'fecha_inicio', 'punto_salida', 'punto_llegada', 'empresa', 'coordinador', 'estado', 'eta'];
const CAMPOS_VIAJE_PORTAL = ['nro', 'fecha_despacho', 'jornada_despacho', 'transportista_nombre', 'placa', 'guia', 'peso_origen', 'ticket', 'peso_destino_calc', 'status', 'vuelta'];

function vistaTransportista(D, I, tid) {
  const op = D.operacion;
  const t = I.transportistas.find((x) => x.id === tid);
  const raw = D.viajes.map((v) => ({ ...v, transportista_nombre: nombreT(I.transportistas, v.transportista_id) }));
  const todos = C.enriquecerViajes(raw, op, D.reportes);
  const viajes = todos.filter((v) => v.transportista_id === tid).map((v) => Object.fromEntries(CAMPOS_VIAJE_PORTAL.map((k) => [k, v[k] ?? null])));
  const unidades = D.unidades.filter((u) => u.transportista_id === tid)
    .map(({ ap_paterno, ap_materno, nombre1, nombre2, dni, brevete, tracto, plataforma }) => ({ ap_paterno, ap_materno, nombre1, nombre2, dni, brevete, tracto, plataforma }));
  return {
    operacion: { ...Object.fromEntries(CAMPOS_OP_PORTAL.map((k) => [k, op[k] ?? null])), nombre: nombreReporte(op) },
    transportista: t ? { id: t.id, ruc: t.ruc, razon_social: t.razon_social, nombre_comercial: t.nombre_comercial, contacto: t.contacto, telefono: t.telefono, emails: t.emails } : null,
    viajes, unidades,
  };
}
async function escribirSiCambia(archivo, data) {
  const json = JSON.stringify(data);
  if (publicado.get(archivo) === json) return false;
  await G.guardarJSON(archivo, data, null);
  publicado.set(archivo, json);
  return true;
}
async function leerPortal(archivo) {
  if (publicado.has(archivo)) return JSON.parse(publicado.get(archivo));
  const { data } = await G.leerJSON(archivo);
  if (data) publicado.set(archivo, JSON.stringify(data));
  return data;
}
/** Publica la operación D en la carpeta de cada usuario transportista que participa en ella. */
async function publicarPortalOp(D, soloEmail = null) {
  const I = await leer(INDICE);
  const usuarios = (I.usuarios || []).filter((u) => u.rol === 'transportista' && u.activo !== false && u.transportista_id && (!soloEmail || u.email === soloEmail));
  for (const u of usuarios) {
    const v = vistaTransportista(D, I, u.transportista_id);
    const participa = v.viajes.length || v.unidades.length || D.op_transportistas.some((p) => p.transportista_id === u.transportista_id);
    const dir = portalDir(u.email);
    const archivo = `${dir}/${nombreReporte(D.operacion)}.json`;
    const lista = (await leerPortal(`${dir}/operaciones.json`)) || [];
    const resto = lista.filter((x) => x.id !== D.operacion.id);
    if (!participa) {
      if (resto.length !== lista.length) await escribirSiCambia(`${dir}/operaciones.json`, resto);
      continue;
    }
    await escribirSiCambia(archivo, { ...v, generado_en: ahora() });
    const suma = (k) => C.r3(v.viajes.reduce((s, x) => s + (Number(x[k]) || 0), 0));
    resto.push({ id: D.operacion.id, nombre: v.operacion.nombre, archivo: archivo.split('/').pop(), nave: D.operacion.nave, orden: D.operacion.orden,
      cliente: D.operacion.cliente, estado: D.operacion.estado, viajes: v.viajes.length, pendientes: v.viajes.filter((x) => x.status === C.STATUS.PENDIENTE).length,
      tn_huacho: suma('peso_origen'), tn_cspcp: suma('peso_destino_calc'), unidades: v.unidades.length, ultimo_viaje: v.viajes.map((x) => x.fecha_despacho).sort().pop() || null });
    resto.sort((a, b) => b.id - a.id);
    await escribirSiCambia(`${dir}/operaciones.json`, resto);
  }
}
/** Crea/actualiza la carpeta del usuario, publica sus datos y le da acceso de lectura. */
async function activarPortal(email) {
  const I = await leer(INDICE, true);
  const u = (I.usuarios || []).find((x) => x.email === email);
  const t = I.transportistas.find((x) => x.id === u.transportista_id);
  const dir = portalDir(email);
  await escribirSiCambia(`${dir}/perfil.json`, { email, nombre: u.nombre, activo: true,
    transportista: { id: t.id, ruc: t.ruc, razon_social: t.razon_social, nombre_comercial: t.nombre_comercial } });
  publicado.delete(`${dir}/operaciones.json`);
  await escribirSiCambia(`${dir}/operaciones.json`, []);
  for (const o of I.operaciones) {
    const D = await leer(await opFile(o.id));
    if (D?.operacion) await publicarPortalOp(D, email);
  }
  let aviso = null;
  try {
    await G.compartirCarpeta(dir, email, `Pacífico Despachos le dio acceso al portal de transportistas de Control de Unidades (${t.nombre_comercial}). Ingrese en ${G.appUrl()}`);
  } catch (e) { aviso = `Los datos se publicaron, pero no se pudo dar el permiso en SharePoint: ${e.message}. Compártale la carpeta "${G.getCfg().carpeta}/${dir}" (sólo lectura) manualmente.`; }
  return { ok: true, aviso };
}
/** Quita el acceso del usuario a su carpeta y marca el perfil como inactivo. */
async function desactivarPortal(email) {
  const dir = portalDir(email);
  try { await G.dejarDeCompartir(dir, email); } catch (e) { console.warn('dejarDeCompartir', e.message); }
  try { publicado.delete(`${dir}/perfil.json`); await G.guardarJSON(`${dir}/perfil.json`, { email, activo: false }, null); } catch { /* */ }
}
ruta('POST', '/portal/republicar', async () => {
  ADMIN();
  publicado.clear();
  const I = await leer(INDICE, true);
  const us = (I.usuarios || []).filter((u) => u.rol === 'transportista' && u.activo !== false);
  const avisos = [];
  for (const u of us) { const r = await activarPortal(u.email); if (r.aviso) avisos.push(`${u.email}: ${r.aviso}`); }
  return { usuarios: us.length, avisos };
});

/* rutas del propio transportista */
const exigeTransp = () => { if (yo?.rol !== 'transportista') throw err(403, 'Sólo para usuarios transportistas'); };
ruta('GET', '/portal/operaciones', async () => { exigeTransp(); return (await G.leerJSON(`${portalDir(yo.email)}/operaciones.json`)).data || []; });
async function vistaPortal(id) {
  exigeTransp();
  const lista = (await G.leerJSON(`${portalDir(yo.email)}/operaciones.json`)).data || [];
  const e = lista.find((x) => x.id === Number(id));
  if (!e) throw err(404, 'Operación no disponible');
  const { data } = await G.leerJSON(`${portalDir(yo.email)}/${e.archivo}`);
  if (!data) throw err(404, 'Operación no disponible');
  return data;
}
ruta('GET', '/portal/op/:id', async ({ id }) => vistaPortal(id));
ruta('GET', '/portal/op/:id/exportar/reporte-xlsx', async ({ id }) => {
  const v = await vistaPortal(id);
  return { blob: await X.exportarTransportista(v.operacion, v.transportista, v.viajes), nombre: `${v.operacion.nombre} - ${v.transportista.nombre_comercial}.xlsx` };
});
ruta('GET', '/portal/op/:id/exportar/reporte-pdf', async ({ id }) => {
  const v = await vistaPortal(id);
  return { blob: await P.pdfTransportista(v.operacion, v.transportista, v.viajes), nombre: `${v.operacion.nombre} - ${v.transportista.nombre_comercial}.pdf` };
});
ruta('GET', '/portal/op/:id/exportar/unidades-xlsx', async ({ id }) => {
  const v = await vistaPortal(id);
  return { blob: await X.exportarUnidades(v.operacion, v.transportista, v.unidades), nombre: `${v.operacion.nombre} - UNIDADES ${v.transportista.nombre_comercial}.xlsx` };
});
ruta('GET', '/portal/op/:id/exportar/unidades-pdf', async ({ id }) => {
  const v = await vistaPortal(id);
  return { blob: await P.pdfUnidades(v.operacion, v.transportista, v.unidades), nombre: `${v.operacion.nombre} - UNIDADES ${v.transportista.nombre_comercial}.pdf` };
});

/** Punto de entrada: igual a fetch('/api' + path). */
export async function request(path, { method = 'GET', body, form } = {}) {
  const p = path.split('?')[0];
  if (yo?.rol === 'transportista' && !/^\/(me|catalogos|portal)(\/|$)/.test(p)) throw err(403, 'No tiene permisos para esta acción');
  for (const r of rutas) {
    if (r.m !== method) continue;
    const m = p.match(r.re);
    if (m) return r.fn(m.groups || {}, body || {}, form);
  }
  throw err(404, 'Ruta no encontrada');
}
