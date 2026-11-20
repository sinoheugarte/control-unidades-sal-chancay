'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const { db, audit } = require('./db');
const auth = require('./auth');
const C = require('./calc');
const imp = require('./importers');
const exp = require('./exporters');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const ESCRIBE = auth.requireRol('admin', 'operador');
const ADMIN = auth.requireRol('admin');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(auth.sessionUser);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const N = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
const S = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

/* ---------------- autenticación ---------------- */
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/me', auth.requireAuth, (req, res) => res.json(req.user));
app.use('/api', auth.requireAuth);

/* ---------------- carga de una operación con todo calculado ---------------- */
function getOp(id) {
  const op = db.prepare('SELECT * FROM operaciones WHERE id = ?').get(id);
  if (!op) { const e = new Error('Operación no encontrada'); e.status = 404; throw e; }
  return op;
}
function cargar(opId) {
  const op = getOp(opId);
  const reportes = db.prepare('SELECT * FROM reportes WHERE operacion_id = ? ORDER BY tipo, numero').all(opId);
  const raw = db.prepare(`SELECT v.*, t.nombre_comercial AS transportista_nombre FROM viajes v
    LEFT JOIN transportistas t ON t.id = v.transportista_id WHERE v.operacion_id = ?`).all(opId);
  const viajes = C.enriquecerViajes(raw, op, reportes);
  const etapas = db.prepare('SELECT * FROM embarque_etapas WHERE operacion_id = ? ORDER BY id').all(opId);
  const embarque = C.tablaEmbarque(op, reportes, etapas);
  return { op, reportes, viajes, embarque };
}
function participantes(opId) {
  return db.prepare(`SELECT ot.*, t.ruc, t.razon_social, t.nombre_comercial, t.contacto, t.telefono, t.emails
    FROM op_transportistas ot JOIN transportistas t ON t.id = ot.transportista_id
    WHERE ot.operacion_id = ? ORDER BY t.nombre_comercial`).all(opId);
}
const unidadesDe = (opId) => db.prepare(`SELECT u.*, t.nombre_comercial AS transportista_nombre FROM unidades u
  LEFT JOIN transportistas t ON t.id = u.transportista_id WHERE u.operacion_id = ? ORDER BY t.nombre_comercial, u.ap_paterno`).all(opId);

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

app.get('/api/operaciones', (req, res) => {
  const ops = db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM viajes v WHERE v.operacion_id = o.id) AS n_viajes
    FROM operaciones o ORDER BY o.id DESC`).all();
  res.json(ops);
});
app.get('/api/operaciones/:id', (req, res) => res.json(getOp(req.params.id)));
app.post('/api/operaciones', ESCRIBE, (req, res) => {
  const o = opDesdeBody(req.body);
  if (!o.nave || !o.orden) return res.status(400).json({ error: 'Nave y orden son obligatorios' });
  o.tn_programadas = o.tn_programadas || 0;
  const cols = Object.keys(o);
  const id = db.prepare(`INSERT INTO operaciones (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(o).lastInsertRowid;
  audit(req.user.id, 'crear_operacion', { id, nave: o.nave, orden: o.orden });
  res.json(getOp(id));
});
app.put('/api/operaciones/:id', ESCRIBE, (req, res) => {
  getOp(req.params.id);
  const o = opDesdeBody(req.body);
  const cols = Object.keys(o);
  if (cols.length) db.prepare(`UPDATE operaciones SET ${cols.map((c) => `${c}=@${c}`).join(',')} WHERE id=@id`).run({ ...o, id: req.params.id });
  res.json(getOp(req.params.id));
});
app.delete('/api/operaciones/:id', ADMIN, (req, res) => {
  const op = getOp(req.params.id);
  db.prepare('DELETE FROM operaciones WHERE id = ?').run(op.id);
  audit(req.user.id, 'eliminar_operacion', { id: op.id, nave: op.nave, orden: op.orden });
  res.json({ ok: true });
});

/* ---------------- tablero ---------------- */
app.get('/api/operaciones/:id/tablero', (req, res) => {
  const { op, reportes, viajes, embarque } = cargar(req.params.id);
  const parts = participantes(op.id);
  const unidades = unidadesDe(op.id);
  res.json({
    operacion: op,
    totales: C.totales(viajes, op, embarque),
    preacopio: C.preacopio(op),
    transportistas: C.resumenTransportistas(viajes, parts, unidades),
    jornadas: C.resumenJornadas(viajes),
    unidades: C.resumenUnidades(viajes),
    tiempos: C.resumenTiempos(viajes),
    reportes_despacho: C.tablaReportes(viajes, op, reportes, 'despacho'),
    reportes_acopio: C.tablaReportes(viajes, op, reportes, 'acopio'),
    embarque,
    unidades_en_lista: unidades.length,
    ultimos: viajes.slice(-8).reverse(),
  });
});

/* ---------------- viajes ---------------- */
app.get('/api/operaciones/:id/viajes', (req, res) => res.json(cargar(req.params.id).viajes));

function viajeDesdeBody(b, opId) {
  const placa = C.normPlaca(b.placa);
  const despacho_en = C.normDT(b.despacho_en);
  const ingreso_en = C.normDT(b.ingreso_en);
  const fecha_despacho = C.normDate(b.fecha_despacho) || (despacho_en ? despacho_en.slice(0, 10) : null);
  let transportista_id = N(b.transportista_id);
  if (!transportista_id && placa) {
    const u = db.prepare('SELECT transportista_id FROM unidades WHERE operacion_id = ? AND (tracto = ? OR plataforma = ?)').get(opId, placa, placa);
    transportista_id = u?.transportista_id || null;
  }
  const ticket = S(b.ticket);
  return {
    transportista_id, placa, fecha_despacho,
    jornada_despacho: S(b.jornada_despacho) || C.jornadaDe(despacho_en),
    despacho_en, guia: S(b.guia), peso_origen: N(b.peso_origen),
    fecha_recepcion: C.normDate(b.fecha_recepcion) || (ingreso_en ? ingreso_en.slice(0, 10) : null),
    jornada_recepcion: S(b.jornada_recepcion) || C.jornadaDe(ingreso_en),
    ticket, peso_destino: N(b.peso_destino), ingreso_en, salida_en: C.normDT(b.salida_en),
    rep_despacho: N(b.rep_despacho), rep_acopio: N(b.rep_acopio), observacion: S(b.observacion),
  };
}
function validarViaje(v) {
  if (!v.placa) return 'La placa es obligatoria';
  if (!v.fecha_despacho) return 'La fecha de despacho es obligatoria';
  if (v.peso_origen !== null && (v.peso_origen < 0 || v.peso_origen > 80)) return 'Peso de origen fuera de rango (0 - 80 TN)';
  if (v.peso_destino !== null && (v.peso_destino < 0 || v.peso_destino > 80)) return 'Peso de destino fuera de rango (0 - 80 TN)';
  if (v.ticket && v.ticket !== '-' && v.peso_destino === null) return 'Ingrese el peso de destino del ticket';
  if (v.ingreso_en && v.salida_en && C.toMs(v.salida_en) < C.toMs(v.ingreso_en)) return 'La hora de salida es anterior a la de ingreso';
  return null;
}
const errUnique = (e, res) => {
  if (String(e.message).includes('UNIQUE') && String(e.message).includes('guia')) { res.status(409).json({ error: 'Ya existe un viaje con esa guía de remisión' }); return true; }
  return false;
};

app.post('/api/operaciones/:id/viajes', ESCRIBE, (req, res) => {
  const op = getOp(req.params.id);
  const v = viajeDesdeBody(req.body, op.id);
  const err = validarViaje(v); if (err) return res.status(400).json({ error: err });
  try {
    const cols = Object.keys(v);
    const id = db.prepare(`INSERT INTO viajes (operacion_id, creado_por, ${cols.join(',')}) VALUES (@operacion_id, @creado_por, ${cols.map((c) => '@' + c).join(',')})`)
      .run({ ...v, operacion_id: op.id, creado_por: req.user.id }).lastInsertRowid;
    if (v.transportista_id) db.prepare('INSERT OR IGNORE INTO op_transportistas (operacion_id, transportista_id) VALUES (?,?)').run(op.id, v.transportista_id);
    res.json(cargar(op.id).viajes.find((x) => x.id === Number(id)));
  } catch (e) { if (!errUnique(e, res)) throw e; }
});
app.put('/api/viajes/:vid', ESCRIBE, (req, res) => {
  const cur = db.prepare('SELECT * FROM viajes WHERE id = ?').get(req.params.vid);
  if (!cur) return res.status(404).json({ error: 'Viaje no encontrado' });
  const v = viajeDesdeBody({ ...cur, ...req.body }, cur.operacion_id);
  const err = validarViaje(v); if (err) return res.status(400).json({ error: err });
  try {
    db.prepare(`UPDATE viajes SET ${Object.keys(v).map((c) => `${c}=@${c}`).join(',')} WHERE id=@id`).run({ ...v, id: cur.id });
    if (v.transportista_id) db.prepare('INSERT OR IGNORE INTO op_transportistas (operacion_id, transportista_id) VALUES (?,?)').run(cur.operacion_id, v.transportista_id);
    audit(req.user.id, 'editar_viaje', { id: cur.id });
    res.json(cargar(cur.operacion_id).viajes.find((x) => x.id === cur.id));
  } catch (e) { if (!errUnique(e, res)) throw e; }
});
app.delete('/api/viajes/:vid', ESCRIBE, (req, res) => {
  const cur = db.prepare('SELECT * FROM viajes WHERE id = ?').get(req.params.vid);
  if (!cur) return res.status(404).json({ error: 'Viaje no encontrado' });
  db.prepare('DELETE FROM viajes WHERE id = ?').run(cur.id);
  audit(req.user.id, 'eliminar_viaje', cur);
  res.json({ ok: true });
});

/** Recepción rápida en puerto: asigna el ticket al viaje pendiente más antiguo de la placa. */
app.post('/api/operaciones/:id/recepcion', ESCRIBE, (req, res) => {
  const op = getOp(req.params.id);
  const t = {
    placa: C.normPlaca(req.body.placa), ticket: S(req.body.ticket), peso: N(req.body.peso_destino),
    ingreso: C.normDT(req.body.ingreso_en), salida: C.normDT(req.body.salida_en),
  };
  if (!t.placa || !t.ticket) return res.status(400).json({ error: 'Placa y ticket son obligatorios' });
  if (t.ticket !== '-' && (t.peso === null || t.peso <= 0 || t.peso > 80)) return res.status(400).json({ error: 'Peso neto inválido' });
  const id = imp.asignarTicket(op.id, t);
  if (!id) return res.status(404).json({ error: `La placa ${t.placa} no tiene viajes pendientes de descarga` });
  res.json(cargar(op.id).viajes.find((x) => x.id === id));
});

/* ---------------- transportistas ---------------- */
app.get('/api/transportistas', (req, res) => res.json(db.prepare('SELECT * FROM transportistas ORDER BY nombre_comercial').all()));
const T_CAMPOS = ['ruc', 'razon_social', 'nombre_comercial', 'contacto', 'telefono', 'emails'];
app.post('/api/transportistas', ESCRIBE, (req, res) => {
  const o = Object.fromEntries(T_CAMPOS.map((k) => [k, S(req.body[k])]));
  if (!o.ruc || !o.razon_social || !o.nombre_comercial) return res.status(400).json({ error: 'RUC, razón social y nombre comercial son obligatorios' });
  if (!/^\d{11}$/.test(o.ruc)) return res.status(400).json({ error: 'El RUC debe tener 11 dígitos' });
  o.nombre_comercial = o.nombre_comercial.toUpperCase().replace(/\s+/g, '_');
  try {
    const id = db.prepare(`INSERT INTO transportistas (${T_CAMPOS.join(',')}) VALUES (${T_CAMPOS.map((c) => '@' + c).join(',')})`).run(o).lastInsertRowid;
    res.json(db.prepare('SELECT * FROM transportistas WHERE id = ?').get(id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un transportista con ese RUC o nombre comercial' });
    throw e;
  }
});
app.put('/api/transportistas/:tid', ESCRIBE, (req, res) => {
  const cur = db.prepare('SELECT * FROM transportistas WHERE id = ?').get(req.params.tid);
  if (!cur) return res.status(404).json({ error: 'No encontrado' });
  const o = Object.fromEntries(T_CAMPOS.map((k) => [k, k in req.body ? S(req.body[k]) : cur[k]]));
  try {
    db.prepare(`UPDATE transportistas SET ${T_CAMPOS.map((c) => `${c}=@${c}`).join(',')} WHERE id=@id`).run({ ...o, id: cur.id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'RUC o nombre comercial duplicado' });
    throw e;
  }
  res.json(db.prepare('SELECT * FROM transportistas WHERE id = ?').get(cur.id));
});
app.delete('/api/transportistas/:tid', ADMIN, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM viajes WHERE transportista_id = ?').get(req.params.tid).n;
  if (n) return res.status(409).json({ error: `No se puede eliminar: tiene ${n} viajes registrados` });
  db.prepare('DELETE FROM transportistas WHERE id = ?').run(req.params.tid);
  res.json({ ok: true });
});

app.get('/api/operaciones/:id/transportistas', (req, res) => res.json(participantes(req.params.id)));
app.put('/api/operaciones/:id/transportistas/:tid', ESCRIBE, (req, res) => {
  const b = req.body;
  db.prepare(`INSERT INTO op_transportistas (operacion_id, transportista_id, unidades_solicitadas, tn_prom_unidad, tn_asignadas, reporte_confirmado, observacion)
    VALUES (@op,@t,@us,@tp,@ta,@rc,@obs) ON CONFLICT(operacion_id, transportista_id) DO UPDATE SET
    unidades_solicitadas=@us, tn_prom_unidad=@tp, tn_asignadas=@ta, reporte_confirmado=@rc, observacion=@obs`)
    .run({ op: req.params.id, t: req.params.tid, us: N(b.unidades_solicitadas) || 0, tp: N(b.tn_prom_unidad) || 33,
      ta: N(b.tn_asignadas), rc: b.reporte_confirmado ? 1 : 0, obs: S(b.observacion) });
  res.json({ ok: true });
});
app.delete('/api/operaciones/:id/transportistas/:tid', ESCRIBE, (req, res) => {
  db.prepare('DELETE FROM op_transportistas WHERE operacion_id = ? AND transportista_id = ?').run(req.params.id, req.params.tid);
  res.json({ ok: true });
});

/* ---------------- unidades (lista SIO) ---------------- */
const U_CAMPOS = ['transportista_id', 'ap_paterno', 'ap_materno', 'nombre1', 'nombre2', 'dni', 'brevete', 'tracto', 'plataforma'];
function unidadDesdeBody(b) {
  const o = Object.fromEntries(U_CAMPOS.map((k) => [k, S(b[k])]));
  o.transportista_id = N(b.transportista_id);
  o.tracto = C.normPlaca(o.tracto) || null;
  o.plataforma = C.normPlaca(o.plataforma) || null;
  if (o.ap_paterno) o.ap_paterno = o.ap_paterno.toUpperCase();
  if (o.ap_materno) o.ap_materno = o.ap_materno.toUpperCase();
  if (o.nombre1) o.nombre1 = o.nombre1.toUpperCase();
  if (o.nombre2) o.nombre2 = o.nombre2.toUpperCase();
  return o;
}
app.get('/api/operaciones/:id/unidades', (req, res) => res.json(unidadesDe(req.params.id)));
app.post('/api/operaciones/:id/unidades', ESCRIBE, (req, res) => {
  const op = getOp(req.params.id);
  const o = unidadDesdeBody(req.body);
  if (!o.tracto) return res.status(400).json({ error: 'La placa del tracto es obligatoria' });
  if (o.dni && !/^\d{8}$/.test(o.dni)) return res.status(400).json({ error: 'El DNI debe tener 8 dígitos' });
  const id = db.prepare(`INSERT INTO unidades (operacion_id, ${U_CAMPOS.join(',')}) VALUES (@op, ${U_CAMPOS.map((c) => '@' + c).join(',')})`).run({ ...o, op: op.id }).lastInsertRowid;
  if (o.transportista_id) db.prepare('INSERT OR IGNORE INTO op_transportistas (operacion_id, transportista_id) VALUES (?,?)').run(op.id, o.transportista_id);
  res.json({ id });
});
app.put('/api/unidades/:uid', ESCRIBE, (req, res) => {
  const o = unidadDesdeBody(req.body);
  if (!o.tracto) return res.status(400).json({ error: 'La placa del tracto es obligatoria' });
  if (o.dni && !/^\d{8}$/.test(o.dni)) return res.status(400).json({ error: 'El DNI debe tener 8 dígitos' });
  db.prepare(`UPDATE unidades SET ${U_CAMPOS.map((c) => `${c}=@${c}`).join(',')} WHERE id=@id`).run({ ...o, id: req.params.uid });
  res.json({ ok: true });
});
app.delete('/api/unidades/:uid', ESCRIBE, (req, res) => {
  db.prepare('DELETE FROM unidades WHERE id = ?').run(req.params.uid);
  res.json({ ok: true });
});

/* ---------------- reportes y embarque ---------------- */
app.get('/api/operaciones/:id/reportes', (req, res) => {
  const { op, reportes, viajes, embarque } = cargar(req.params.id);
  res.json({
    despacho: C.tablaReportes(viajes, op, reportes, 'despacho'),
    acopio: C.tablaReportes(viajes, op, reportes, 'acopio'),
    embarque,
  });
});
app.post('/api/operaciones/:id/reportes', ESCRIBE, (req, res) => {
  const op = getOp(req.params.id);
  const tipo = req.body.tipo;
  if (!['despacho', 'acopio', 'embarque'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  const inicio = C.normDT(req.body.inicio, false);
  const fin = C.normDT(req.body.fin, false);
  if (!inicio) return res.status(400).json({ error: 'Fecha-hora de inicio obligatoria' });
  if (fin && C.toMs(fin) <= C.toMs(inicio)) return res.status(400).json({ error: 'El fin debe ser posterior al inicio' });
  const numero = N(req.body.numero) || (db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM reportes WHERE operacion_id = ? AND tipo = ?').get(op.id, tipo).n);
  try {
    db.prepare('INSERT INTO reportes (operacion_id, tipo, numero, inicio, fin, tn_acumulado, observacion) VALUES (?,?,?,?,?,?,?)')
      .run(op.id, tipo, numero, inicio, fin, N(req.body.tn_acumulado), S(req.body.observacion));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: `Ya existe el reporte ${numero}` });
    throw e;
  }
  res.json({ ok: true });
});
app.put('/api/reportes/:rid', ESCRIBE, (req, res) => {
  const cur = db.prepare('SELECT * FROM reportes WHERE id = ?').get(req.params.rid);
  if (!cur) return res.status(404).json({ error: 'No encontrado' });
  const inicio = C.normDT(req.body.inicio ?? cur.inicio, false);
  const fin = C.normDT(req.body.fin, false);
  if (fin && C.toMs(fin) <= C.toMs(inicio)) return res.status(400).json({ error: 'El fin debe ser posterior al inicio' });
  db.prepare('UPDATE reportes SET inicio = ?, fin = ?, tn_acumulado = ?, observacion = ? WHERE id = ?')
    .run(inicio, fin, N(req.body.tn_acumulado), S(req.body.observacion), cur.id);
  res.json({ ok: true });
});
app.delete('/api/reportes/:rid', ESCRIBE, (req, res) => {
  db.prepare('DELETE FROM reportes WHERE id = ?').run(req.params.rid);
  res.json({ ok: true });
});
app.post('/api/operaciones/:id/etapas', ESCRIBE, (req, res) => {
  const op = getOp(req.params.id);
  if (!S(req.body.nombre)) return res.status(400).json({ error: 'Nombre de la etapa obligatorio (ej. 1ETB)' });
  db.prepare('INSERT INTO embarque_etapas (operacion_id, nombre, inicio, fin, observacion) VALUES (?,?,?,?,?)')
    .run(op.id, S(req.body.nombre), C.normDT(req.body.inicio, false), C.normDT(req.body.fin, false), S(req.body.observacion));
  res.json({ ok: true });
});
app.put('/api/etapas/:eid', ESCRIBE, (req, res) => {
  db.prepare('UPDATE embarque_etapas SET nombre = ?, inicio = ?, fin = ?, observacion = ? WHERE id = ?')
    .run(S(req.body.nombre), C.normDT(req.body.inicio, false), C.normDT(req.body.fin, false), S(req.body.observacion), req.params.eid);
  res.json({ ok: true });
});
app.delete('/api/etapas/:eid', ESCRIBE, (req, res) => {
  db.prepare('DELETE FROM embarque_etapas WHERE id = ?').run(req.params.eid);
  res.json({ ok: true });
});

/* ---------------- importación ---------------- */
const archivo = (req) => { if (!req.file) { const e = new Error('Adjunte un archivo Excel (.xlsx/.xlsm) o CSV'); e.status = 400; throw e; } return req.file; };
app.post('/api/importar/libro', ESCRIBE, upload.single('archivo'), wrap(async (req, res) => {
  const f = archivo(req);
  const r = await imp.importarLibro(f.buffer, f.originalname, req.user.id);
  audit(req.user.id, 'importar_libro', { archivo: f.originalname, ...r, avisos: r.avisos.length });
  res.json(r);
}));
app.post('/api/operaciones/:id/importar/:tipo', ESCRIBE, upload.single('archivo'), wrap(async (req, res) => {
  const op = getOp(req.params.id);
  const f = archivo(req);
  let r;
  if (req.params.tipo === 'despachos') r = await imp.importarDespachos(op.id, f.buffer, f.originalname, req.user.id);
  else if (req.params.tipo === 'tickets') r = await imp.importarTickets(op.id, f.buffer, f.originalname);
  else if (req.params.tipo === 'lista') r = await imp.importarLista(op.id, f.buffer, f.originalname);
  else return res.status(400).json({ error: 'Tipo de importación inválido' });
  audit(req.user.id, `importar_${req.params.tipo}`, { op: op.id, archivo: f.originalname });
  res.json(r);
}));

/* ---------------- exportación ---------------- */
const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
function enviarXlsx(res, buf, nombre) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(Buffer.from(buf));
}
app.get('/api/operaciones/:id/exportar/detalle', wrap(async (req, res) => {
  const { op, viajes, embarque } = cargar(req.params.id);
  const buf = await exp.exportarDetalle(op, viajes, C.totales(viajes, op, embarque));
  enviarXlsx(res, buf, `DETALLE_${slug(op.nave)}_ORDEN_${slug(op.orden)}.xlsx`);
}));
app.get('/api/operaciones/:id/exportar/transportista/:tid', wrap(async (req, res) => {
  const { op, viajes } = cargar(req.params.id);
  const t = db.prepare('SELECT * FROM transportistas WHERE id = ?').get(req.params.tid);
  if (!t) return res.status(404).json({ error: 'Transportista no encontrado' });
  const buf = await exp.exportarTransportista(op, t, viajes.filter((v) => v.transportista_id === t.id));
  enviarXlsx(res, buf, `REPORTE_${slug(t.nombre_comercial)}_${slug(op.nave)}_${slug(op.orden)}.xlsx`);
}));

/* ---------------- usuarios ---------------- */
app.get('/api/usuarios', ADMIN, (req, res) => res.json(db.prepare('SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios ORDER BY usuario').all()));
app.post('/api/usuarios', ADMIN, (req, res) => {
  const { usuario, nombre, password, rol } = req.body;
  if (!S(usuario) || !S(nombre) || !password) return res.status(400).json({ error: 'Usuario, nombre y contraseña son obligatorios' });
  if (String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (!['admin', 'operador', 'lector'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    db.prepare('INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?,?,?,?)').run(S(usuario), S(nombre), auth.bcrypt.hashSync(String(password), 10), rol);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'El usuario ya existe' });
    throw e;
  }
  audit(req.user.id, 'crear_usuario', usuario);
  res.json({ ok: true });
});
app.put('/api/usuarios/:uid', ADMIN, (req, res) => {
  const cur = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.uid);
  if (!cur) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, password, rol, activo } = req.body;
  if (rol && !['admin', 'operador', 'lector'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (cur.id === req.user.id && ((rol && rol !== 'admin') || activo === false || activo === 0)) {
    return res.status(400).json({ error: 'No puede quitarse a sí mismo el rol de administrador ni desactivarse' });
  }
  if (password && String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ? WHERE id = ?').run(
    S(nombre) || cur.nombre, rol || cur.rol, activo === undefined ? cur.activo : (activo ? 1 : 0),
    password ? auth.bcrypt.hashSync(String(password), 10) : cur.password_hash, cur.id);
  if (password || activo === false || activo === 0) db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND ? <> ?').run(cur.id, cur.id, req.user.id);
  res.json({ ok: true });
});
/** Cambio de contraseña propio */
app.post('/api/me/password', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
  if (!auth.bcrypt.compareSync(String(req.body.actual || ''), u.password_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (String(req.body.nueva || '').length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(auth.bcrypt.hashSync(String(req.body.nueva), 10), u.id);
  res.json({ ok: true });
});

app.get('/api/catalogos', (req, res) => res.json({ jornadas: C.JORNADAS, rangos: C.RANGOS, status: Object.values(C.STATUS) }));

/* ---------------- errores y SPA ---------------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? `Error interno: ${err.message}` : err.message });
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

if (require.main === module) {
  auth.ensureAdmin();
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => console.log(`Control de Unidades escuchando en http://localhost:${PORT}`));
}

module.exports = app;
