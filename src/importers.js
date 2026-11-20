'use strict';
/**
 * Importadores:
 *  - Reporte SAP de despachos de planta (hoja "REPORTE HUACHO")
 *  - Reporte de tickets de balanza del puerto (hoja "REPORTE CSPCP")
 *  - Lista de unidades / conductores (hoja "LISTA")
 *  - Libro completo "REPORTE DE CONTROL UNIDADES SAL" (.xlsm/.xlsx) -> nueva operación
 */
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { db } = require('./db');
const C = require('./calc');

/* ---------------- utilidades de lectura ---------------- */

function val(cell) {
  if (!cell) return null;
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('formula' in v || 'sharedFormula' in v) v = null;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
    else if ('error' in v) v = null;
  }
  if (v instanceof Date && isNaN(v)) v = null;
  if (typeof v === 'string') { v = v.trim(); if (v === '') v = null; }
  return v ?? null;
}

const normH = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9#]/g, '');

async function loadWorkbook(buffer, filename = '') {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    await wb.csv.read(Readable.from([text]), { parserOptions: { delimiter: sep } });
  } else {
    await wb.xlsx.load(buffer);
  }
  return wb;
}

/** Busca la fila de cabecera que contenga las columnas requeridas y devuelve objetos. */
function rowsByHeader(ws, required, maxScan = 15) {
  for (let r = 1; r <= Math.min(maxScan, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = normH(val(cell));
      if (h && !(h in map)) map[h] = col;
    });
    if (required.every((alts) => alts.some((a) => normH(a) in map))) {
      const out = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const rw = ws.getRow(i);
        const get = (...alts) => {
          for (const a of alts) { const c = map[normH(a)]; if (c) return val(rw.getCell(c)); }
          return null;
        };
        out.push({ _row: i, get });
      }
      return out;
    }
  }
  return null;
}

function findSheet(wb, required) {
  for (const ws of wb.worksheets) {
    const rows = rowsByHeader(ws, required);
    if (rows) return { ws, rows };
  }
  return null;
}

/** Combina una fecha y una hora (Date de Excel o texto) en "YYYY-MM-DD HH:MM:SS". */
function combinarFechaHora(fecha, hora) {
  const f = C.normDate(fecha);
  if (!f) return null;
  if (hora === null || hora === undefined) return `${f} 00:00:00`;
  let hh = 0, mm = 0, ss = 0;
  if (hora instanceof Date) { hh = hora.getUTCHours(); mm = hora.getUTCMinutes(); ss = hora.getUTCSeconds(); }
  else if (typeof hora === 'number') { const t = Math.round((hora % 1) * 86400); hh = Math.floor(t / 3600); mm = Math.floor((t % 3600) / 60); ss = t % 60; }
  else { const m = String(hora).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (m) { hh = +m[1]; mm = +m[2]; ss = +(m[3] || 0); } }
  const p = (n) => String(n).padStart(2, '0');
  return `${f} ${p(hh)}:${p(mm)}:${p(ss)}`;
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(/,(?=\d{1,3}$)/, '.').replace(/,/g, ''));
  return isNaN(n) ? null : n;
};
/** Pesos: si vienen en kg (> 1000) se convierten a toneladas. */
const toTn = (v) => { const n = toNum(v); return n === null ? null : n > 1000 ? C.r3(n / 1000) : n; };
const str = (v) => (v === null || v === undefined ? null : v instanceof Date ? C.normDT(v) : String(v).trim() || null);

/* ---------------- búsqueda de transportista ---------------- */

function resolverTransportista(nombre, placa, operacionId) {
  if (nombre) {
    const n = normH(nombre);
    const all = db.prepare('SELECT id, razon_social, nombre_comercial, ruc FROM transportistas').all();
    const t = all.find((x) => normH(x.razon_social) === n || normH(x.nombre_comercial) === n || normH(x.ruc) === n);
    if (t) return t.id;
  }
  if (placa) {
    const u = db.prepare('SELECT transportista_id FROM unidades WHERE operacion_id = ? AND (tracto = ? OR plataforma = ?) AND transportista_id IS NOT NULL LIMIT 1')
      .get(operacionId, placa, placa);
    if (u) return u.transportista_id;
    const v = db.prepare('SELECT transportista_id FROM viajes WHERE placa = ? AND transportista_id IS NOT NULL ORDER BY id DESC LIMIT 1').get(placa);
    if (v) return v.transportista_id;
  }
  return null;
}

function asegurarParticipacion(operacionId, transportistaId) {
  if (!transportistaId) return;
  db.prepare('INSERT OR IGNORE INTO op_transportistas (operacion_id, transportista_id) VALUES (?,?)').run(operacionId, transportistaId);
}

/* ---------------- importador: despachos de planta (SAP) ---------------- */

async function importarDespachos(operacionId, buffer, filename, userId) {
  const wb = await loadWorkbook(buffer, filename);
  const found = findSheet(wb, [['Referencia', 'GUIA', 'GUIA R. HUACHO', 'GUIA REMISION'], ['Placa', 'PLACA']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "Referencia" (guía) y "Placa".');
  const res = { insertados: 0, duplicados: 0, sin_transportista: 0, omitidos: 0, errores: [] };
  const existe = db.prepare('SELECT id FROM viajes WHERE operacion_id = ? AND guia = ?');
  const ins = db.prepare(`INSERT INTO viajes (operacion_id, transportista_id, placa, fecha_despacho, jornada_despacho, despacho_en, guia, peso_origen, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (const r of found.rows) {
      const guia = str(r.get('Referencia', 'GUIA R. HUACHO', 'GUIA', 'GUIA REMISION'));
      const placa = C.normPlaca(r.get('Placa', 'PLACA'));
      if (!guia || !placa) { if (guia || placa) res.omitidos++; continue; }
      if (existe.get(operacionId, guia)) { res.duplicados++; continue; }
      const peso = toTn(r.get('P.Neto Ent. Ton', 'Peso TON', 'P.Neto Ton.', 'PESO TN X UNID HUACHO', 'P.Neto Ent.', 'Peso neto', 'PESO'));
      const salida = combinarFechaHora(r.get('FeActDpExp', 'FinActCarg', 'Fe.SM real', 'DIA DESPACHO', 'FECHA'), r.get('HrADpExp', 'HrAFCg', 'HORA'));
      const inicioCarga = combinarFechaHora(r.get('InActCarga', 'FeActDpExp', 'Fe.SM real', 'DIA DESPACHO', 'FECHA'), r.get('HrAICg', 'HrADpExp', 'HORA'));
      if (!salida) { res.errores.push(`Fila ${r._row}: sin fecha de despacho`); continue; }
      const jornada = str(r.get('JORNADA DESPACHO', 'JORNADA')) || C.jornadaDe(inicioCarga || salida);
      const tId = resolverTransportista(str(r.get('Número de transportista', 'TRANSPORTE', 'TRANSPORTISTA', 'Nombre transportista')), placa, operacionId);
      if (!tId) res.sin_transportista++;
      asegurarParticipacion(operacionId, tId);
      ins.run(operacionId, tId, placa, (inicioCarga || salida).slice(0, 10), jornada, salida, guia, peso, userId);
      res.insertados++;
    }
  })();
  return res;
}

/* ---------------- importador: tickets de balanza del puerto ---------------- */

function asignarTicket(operacionId, t) {
  const porTicket = db.prepare('SELECT id FROM viajes WHERE operacion_id = ? AND ticket = ? AND ticket <> \'-\'').get(operacionId, t.ticket);
  let id = porTicket?.id;
  if (!id) {
    const cand = db.prepare(`SELECT id FROM viajes WHERE operacion_id = ? AND placa = ? AND (ticket IS NULL OR ticket = '')
      ORDER BY fecha_despacho, COALESCE(despacho_en, fecha_despacho), id LIMIT 1`).get(operacionId, t.placa);
    id = cand?.id;
  }
  if (!id) return null;
  db.prepare(`UPDATE viajes SET ticket = ?, peso_destino = ?, ingreso_en = ?, salida_en = ?,
      fecha_recepcion = COALESCE(?, fecha_recepcion), jornada_recepcion = COALESCE(?, jornada_recepcion) WHERE id = ?`)
    .run(t.ticket, t.peso, t.ingreso, t.salida, t.ingreso ? t.ingreso.slice(0, 10) : null, t.ingreso ? C.jornadaDe(t.ingreso) : null, id);
  return id;
}

async function importarTickets(operacionId, buffer, filename) {
  const wb = await loadWorkbook(buffer, filename);
  const found = findSheet(wb, [['PLACA'], ['TICKET', 'TICKET CSPCP', 'NRO TICKET'], ['PESO NETO', 'PESO', 'PESO TN', 'NETO']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "PLACA", "TICKET" y "PESO NETO".');
  const tickets = [];
  for (const r of found.rows) {
    const placa = C.normPlaca(r.get('PLACA'));
    const ticket = str(r.get('TICKET', 'TICKET CSPCP', 'NRO TICKET'));
    if (!placa || !ticket) continue;
    tickets.push({
      placa, ticket,
      peso: toTn(r.get('PESO NETO', 'PESO', 'PESO TN', 'NETO')),
      ingreso: C.normDT(str(r.get('TIEMPO INGRESO', 'HORA INGRESO', 'FECHA INGRESO', 'INGRESO'))),
      salida: C.normDT(str(r.get('TIEMPO SALIDA', 'HORA SALIDA', 'FECHA SALIDA', 'SALIDA'))),
    });
  }
  tickets.sort((a, b) => (C.toMs(a.ingreso) ?? 0) - (C.toMs(b.ingreso) ?? 0));
  const res = { procesados: tickets.length, asignados: 0, sin_viaje: [] };
  db.transaction(() => {
    for (const t of tickets) {
      if (asignarTicket(operacionId, t)) res.asignados++;
      else res.sin_viaje.push(`${t.placa} / ticket ${t.ticket}`);
    }
  })();
  return res;
}

/* ---------------- importador: lista de unidades ---------------- */

async function importarLista(operacionId, buffer, filename) {
  const wb = await loadWorkbook(buffer, filename);
  const found = findSheet(wb, [['TRACTO', 'PLACA'], ['RUC', 'TRANSPORTISTA']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "TRACTO" y "RUC".');
  const res = { insertados: 0, actualizados: 0, sin_transportista: 0 };
  const sel = db.prepare('SELECT id FROM unidades WHERE operacion_id = ? AND tracto = ?');
  const ins = db.prepare(`INSERT INTO unidades (operacion_id, transportista_id, ap_paterno, ap_materno, nombre1, nombre2, dni, brevete, tracto, plataforma)
    VALUES (@op,@t,@ap,@am,@n1,@n2,@dni,@brevete,@tracto,@plataforma)`);
  const upd = db.prepare(`UPDATE unidades SET transportista_id=@t, ap_paterno=@ap, ap_materno=@am, nombre1=@n1, nombre2=@n2,
    dni=@dni, brevete=@brevete, plataforma=@plataforma WHERE id=@id`);
  db.transaction(() => {
    for (const r of found.rows) {
      const tracto = C.normPlaca(r.get('TRACTO', 'PLACA'));
      if (!tracto) continue;
      const ruc = str(r.get('RUC'));
      const tId = ruc ? db.prepare('SELECT id FROM transportistas WHERE ruc = ?').get(String(ruc))?.id
        : resolverTransportista(str(r.get('TRANSPORTISTA')), null, operacionId);
      if (!tId) res.sin_transportista++;
      asegurarParticipacion(operacionId, tId);
      const o = {
        op: operacionId, t: tId || null,
        ap: str(r.get('AP. PATERNO', 'APELLIDO PATERNO')), am: str(r.get('AP. MATERNO', 'APELLIDO MATERNO')),
        n1: str(r.get('1ER NOMBRE', 'NOMBRES', 'NOMBRE')), n2: str(r.get('2DO NOMBRE')),
        dni: str(r.get('DNI')), brevete: str(r.get('BREVETE', 'LICENCIA')),
        tracto, plataforma: C.normPlaca(r.get('PLATAFORMA', 'CARRETA')) || null,
      };
      const e = sel.get(operacionId, tracto);
      if (e) { upd.run({ ...o, id: e.id }); res.actualizados++; } else { ins.run(o); res.insertados++; }
    }
  })();
  return res;
}

/* ---------------- importador: libro completo ---------------- */

async function importarLibro(buffer, filename, userId) {
  const wb = await loadWorkbook(buffer, filename);
  const sh = (n) => wb.worksheets.find((w) => normH(w.name) === normH(n));
  const cv = (ws, addr) => (ws ? val(ws.getCell(addr)) : null);

  const emb = sh('RESUMEN EMBARQUE');
  const det = sh('DETALLE TRANSPORTE');
  if (!det) throw new Error('El libro no contiene la hoja "DETALLE TRANSPORTE".');
  const cab = wb.worksheets.find((w) => normH(cv(w, 'B4')) === normH('REPORTE DE SERVICIO TRANSPORTE') && cv(w, 'D5') && !String(w.getCell('D5').formula || '').length);
  const pre = sh('PREACOPIO');
  const res = { avisos: [] };

  // RESUMEN ACOPIO trae el título con la nave/ETA; RESUMEN EMBARQUE los datos de la nave.
  const op = {
    nave: str(cv(emb, 'C4')) || str(cv(cab, 'D5')) || 'SIN NOMBRE',
    orden: str(cv(emb, 'F4')) || 'S/N',
    manifiesto: str(cv(emb, 'C5')), dam: str(cv(emb, 'F5')) || str(cv(cab, 'H6')),
    eta: C.normDT(cv(emb, 'C6'), false),
    cliente: str(cv(cab, 'H5')), producto: str(cv(cab, 'D6')), referencia: str(cv(cab, 'H7')),
    punto_salida: str(cv(cab, 'D8')), punto_llegada: str(cv(cab, 'D9')),
    fecha_inicio: C.normDate(cv(cab, 'D7')),
    empresa: (str(cv(det, 'B2')) || 'PACIFICO DESPACHOS S.A.C.').trim(),
    tn_programadas: toNum(cv(det, 'S1')) || toNum(cv(pre, 'B7')) || 0,
    tn_embarque_programadas: toNum(cv(emb, 'C35')),
    tn_draft_sgs: toNum(cv(emb, 'G35')),
    params: JSON.stringify(pre ? {
      tn_x_unidad: toNum(cv(pre, 'B8')), viajes_x_hora: toNum(cv(pre, 'B10')), jornadas_x_dia: toNum(cv(pre, 'B13')),
      inicio_acopio: C.normDT(cv(pre, 'C15'), false), tn_x_hora_embarque: toNum(cv(pre, 'E8')),
      inicio_embarque: C.normDT(cv(pre, 'F13'), false),
      round_trip: [7, 8, 9, 10, 11, 12, 13, 14, 15].map((r) => {
        const t = cv(pre, `I${r}`);
        return { etapa: str(cv(pre, `H${r}`)), min: t instanceof Date ? t.getUTCHours() * 60 + t.getUTCMinutes() : toNum(t) };
      }).filter((x) => x.etapa),
    } : {}),
  };
  // Coordinador: celda "APROBADO: <nombre>" al pie de los reportes por transportista
  let coord = null;
  for (const w of wb.worksheets) {
    for (let r = 700; r <= Math.min(w.rowCount, 1000) && !coord; r++) {
      const t = str(cv(w, `B${r}`));
      if (t && /^APROBADO:/i.test(t)) coord = t.replace(/^APROBADO:\s*/i, '').trim() || null;
    }
    if (coord) break;
  }
  op.coordinador = coord;

  db.transaction(() => {
    const opId = db.prepare(`INSERT INTO operaciones (nave, orden, manifiesto, dam, eta, cliente, producto, referencia, punto_salida, punto_llegada,
      empresa, coordinador, fecha_inicio, tn_programadas, tn_embarque_programadas, tn_draft_sgs, params)
      VALUES (@nave,@orden,@manifiesto,@dam,@eta,@cliente,@producto,@referencia,@punto_salida,@punto_llegada,
      @empresa,@coordinador,@fecha_inicio,@tn_programadas,@tn_embarque_programadas,@tn_draft_sgs,@params)`).run(op).lastInsertRowid;
    res.operacion_id = Number(opId);

    // Transportistas (BASE + TRANSPORTISTAS + hojas por transportista)
    const base = sh('BASE');
    const upT = db.prepare(`INSERT INTO transportistas (ruc, razon_social, nombre_comercial) VALUES (?,?,?)
      ON CONFLICT(ruc) DO UPDATE SET razon_social = excluded.razon_social, nombre_comercial = excluded.nombre_comercial`);
    if (base) {
      for (let r = 4; r <= 40; r++) {
        const ruc = str(cv(base, `B${r}`)); const rs = str(cv(base, `C${r}`)); const nc = str(cv(base, `D${r}`));
        if (ruc && rs && nc) upT.run(ruc, rs, nc);
      }
    }
    const trs = sh('TRANSPORTISTAS');
    if (trs) {
      for (let r = 5; r <= 40; r++) {
        const nc = str(cv(trs, `B${r}`)); const rs = str(cv(trs, `C${r}`)); const ruc = str(cv(trs, `D${r}`));
        if (!nc || !ruc || normH(rs) === 'TOTAL') continue;
        upT.run(ruc, rs || nc, nc);
        const tId = db.prepare('SELECT id FROM transportistas WHERE ruc = ?').get(ruc).id;
        db.prepare(`INSERT OR REPLACE INTO op_transportistas (operacion_id, transportista_id, unidades_solicitadas, tn_prom_unidad, tn_asignadas, reporte_confirmado)
          VALUES (?,?,?,?,?,?)`).run(opId, tId, toNum(cv(trs, `E${r}`)) || 0, toNum(cv(trs, `G${r}`)) || 33,
          toNum(cv(trs, `AE${r}`)), cv(trs, `N${r}`) ? 1 : 0);
        const hoja = sh(nc) || wb.worksheets.find((w) => normH(cv(w, 'K10')) === normH(nc));
        if (hoja) {
          const emails = ['O2', 'O3', 'O4', 'O5', 'O6'].map((a) => str(cv(hoja, a))).filter((x) => x && x.includes('@'));
          db.prepare('UPDATE transportistas SET contacto = COALESCE(?, contacto), telefono = COALESCE(?, telefono), emails = COALESCE(?, emails) WHERE id = ?')
            .run(str(cv(hoja, 'O7')), str(cv(hoja, 'O8')), emails.length ? emails.join(', ') : null, tId);
        }
      }
    }

    // Lista de unidades
    const lista = sh('LISTA');
    if (lista) {
      const rows = rowsByHeader(lista, [['TRACTO'], ['RUC']]) || [];
      const ins = db.prepare(`INSERT INTO unidades (operacion_id, transportista_id, ap_paterno, ap_materno, nombre1, nombre2, dni, brevete, tracto, plataforma)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      let n = 0;
      for (const r of rows) {
        const tracto = C.normPlaca(r.get('TRACTO')); if (!tracto) continue;
        const tId = db.prepare('SELECT id FROM transportistas WHERE ruc = ?').get(String(r.get('RUC') ?? ''))?.id || null;
        ins.run(opId, tId, str(r.get('AP. PATERNO')), str(r.get('AP. MATERNO')), str(r.get('1ER NOMBRE')), str(r.get('2DO NOMBRE')),
          str(r.get('DNI')), str(r.get('BREVETE')), tracto, C.normPlaca(r.get('PLATAFORMA')) || null);
        n++;
      }
      res.unidades = n;
    }

    // Horas de salida de planta (REPORTE HUACHO) y tiempos de balanza (REPORTE CSPCP)
    const salidaPorGuia = new Map();
    const hua = sh('REPORTE HUACHO');
    if (hua) {
      for (const r of rowsByHeader(hua, [['Referencia'], ['Placa']]) || []) {
        const g = str(r.get('Referencia')); if (!g) continue;
        salidaPorGuia.set(g, combinarFechaHora(r.get('FeActDpExp', 'Fe.SM real'), r.get('HrADpExp')));
      }
    }
    const tiemposPorTicket = new Map();
    const csp = sh('REPORTE CSPCP');
    if (csp) {
      for (const r of rowsByHeader(csp, [['PLACA'], ['TICKET']]) || []) {
        const t = str(r.get('TICKET')); if (!t) continue;
        tiemposPorTicket.set(t, { ingreso: C.normDT(str(r.get('TIEMPO INGRESO'))), salida: C.normDT(str(r.get('TIEMPO SALIDA'))) });
      }
    }

    // Viajes
    const rows = rowsByHeader(det, [['DIA DESPACHO'], ['PLACA'], ['GUIA R. HUACHO']]) || [];
    const ins = db.prepare(`INSERT INTO viajes (operacion_id, transportista_id, placa, fecha_despacho, jornada_despacho, despacho_en, guia, peso_origen,
      fecha_recepcion, jornada_recepcion, ticket, peso_destino, ingreso_en, salida_en, rep_despacho, rep_acopio, creado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let nv = 0;
    const guias = new Set();
    for (const r of rows) {
      const fecha = C.normDate(r.get('DIA DESPACHO'));
      const placa = C.normPlaca(r.get('PLACA'));
      if (!fecha || !placa) continue;
      let guia = str(r.get('GUIA R. HUACHO'));
      if (guia && guias.has(guia)) { res.avisos.push(`Guía duplicada ${guia} (fila ${r._row})`); guia = `${guia}#${r._row}`; }
      if (guia) guias.add(guia);
      const ticket = str(r.get('TICKET CSPCP'));
      const tt = ticket ? tiemposPorTicket.get(ticket) : null;
      const tNom = str(r.get('TRANSPORTE'));
      const tId = resolverTransportista(tNom, placa, opId);
      if (!tId) res.avisos.push(`Transportista no encontrado: ${tNom} (placa ${placa})`);
      asegurarParticipacion(opId, tId);
      ins.run(opId, tId, placa, fecha, str(r.get('JORNADA DESPACHO')), (guia && salidaPorGuia.get(guia)) || null, guia,
        toNum(r.get('PESO TN X UNID HUACHO')), C.normDate(r.get('DIA RECEPCION')), str(r.get('JORNADA RECEPCION')),
        ticket, ticket ? toNum(r.get('PESO TN X UNID CSPCP')) : null, tt?.ingreso || null, tt?.salida || null,
        toNum(r.get('# REPORTE DESPACHO')), toNum(r.get('# REPORTE ACOPIO')), userId);
      nv++;
    }
    res.viajes = nv;

    // Ventanas de reporte (hoja REPORTES)
    const rep = sh('REPORTES');
    const insR = db.prepare('INSERT OR REPLACE INTO reportes (operacion_id, tipo, numero, inicio, fin, tn_acumulado) VALUES (?,?,?,?,?,?)');
    const cols = Array.from({ length: 30 }, (_, i) => colLetra(i + 2));
    if (rep) {
      for (const [tipo, rN, rI, rF] of [['despacho', 3, 5, 6], ['acopio', 34, 36, 37]]) {
        cols.forEach((c, i) => {
          const ini = C.normDT(cv(rep, `${c}${rI}`), false);
          if (ini) insR.run(opId, tipo, toNum(cv(rep, `${c}${rN}`)) || i + 1, ini, C.normDT(cv(rep, `${c}${rF}`), false), null);
        });
      }
    }
    // Embarque
    if (emb) {
      cols.forEach((c, i) => {
        const ini = C.normDT(cv(emb, `${c}16`), false);
        if (!ini) return;
        const acum = i === 0 ? toNum(cv(emb, `${c}19`)) : toNum(cv(emb, `${c}25`));
        insR.run(opId, 'embarque', i + 1, ini, C.normDT(cv(emb, `${c}17`), false), acum);
      });
      for (let r = 9; r <= 14; r++) {
        const nombre = str(cv(emb, `B${r}`));
        if (!nombre) continue;
        db.prepare('INSERT INTO embarque_etapas (operacion_id, nombre, inicio, fin, observacion) VALUES (?,?,?,?,?)')
          .run(opId, nombre, C.normDT(cv(emb, `C${r}`), false), C.normDT(cv(emb, `D${r}`), false), str(cv(emb, `G${r}`)));
      }
    }
  })();
  return res;
}

function colLetra(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

module.exports = { importarDespachos, importarTickets, importarLista, importarLibro, asignarTicket };
