// Importación y exportación de Excel en el navegador (ExcelJS).
// Trabaja sobre objetos en memoria: D = datos de una operación, T = maestro de transportistas.
import * as C from './calc.js';

const XL = () => window.ExcelJS;

/* ---------------- lectura ---------------- */
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
const normH = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9#]/g, '');

function parseCSV(text) {
  const first = text.split('\n')[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export async function cargarLibro(file) {
  const wb = new (XL().Workbook)();
  if (/\.csv$/i.test(file.name)) {
    const ws = wb.addWorksheet('CSV');
    parseCSV((await file.text()).replace(/^﻿/, '')).forEach((r) => ws.addRow(r.map((x) => (x === '' ? null : x))));
  } else {
    await wb.xlsx.load(await file.arrayBuffer());
  }
  return wb;
}

function rowsByHeader(ws, required, maxScan = 15) {
  for (let r = 1; r <= Math.min(maxScan, ws.rowCount); r++) {
    const map = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => { const h = normH(val(cell)); if (h && !(h in map)) map[h] = col; });
    if (required.every((alts) => alts.some((a) => normH(a) in map))) {
      const out = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const rw = ws.getRow(i);
        out.push({ _row: i, get: (...alts) => { for (const a of alts) { const c = map[normH(a)]; if (c) return val(rw.getCell(c)); } return null; } });
      }
      return out;
    }
  }
  return null;
}
function findSheet(wb, required) {
  for (const ws of wb.worksheets) { const rows = rowsByHeader(ws, required); if (rows) return { ws, rows }; }
  return null;
}

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
const toTn = (v) => { const n = toNum(v); return n === null ? null : n > 1000 ? C.r3(n / 1000) : n; };
const str = (v) => (v === null || v === undefined ? null : v instanceof Date ? C.normDT(v) : String(v).trim() || null);

/* ---------------- utilidades sobre los datos ---------------- */
export function resolverTransportista(T, D, nombre, placa) {
  if (nombre) {
    const n = normH(nombre);
    const t = T.find((x) => normH(x.razon_social) === n || normH(x.nombre_comercial) === n || normH(x.ruc) === n);
    if (t) return t.id;
  }
  if (placa) {
    const u = D.unidades.find((x) => (x.tracto === placa || x.plataforma === placa) && x.transportista_id);
    if (u) return u.transportista_id;
    const v = [...D.viajes].reverse().find((x) => x.placa === placa && x.transportista_id);
    if (v) return v.transportista_id;
  }
  return null;
}
export function asegurarParticipacion(D, tid) {
  if (!tid || D.op_transportistas.some((p) => p.transportista_id === tid)) return;
  D.op_transportistas.push({ transportista_id: tid, unidades_solicitadas: 0, tn_prom_unidad: 33, tn_asignadas: null, reporte_confirmado: 0, observacion: null });
}
const nuevoId = (D) => { D.seq = (D.seq || 0) + 1; return D.seq; };
const ahora = () => C.fmtDT(Date.now() - new Date().getTimezoneOffset() * 60000, true);

/** Asigna un ticket de balanza al viaje correspondiente (mismo ticket o viaje pendiente más antiguo de la placa). */
export function asignarTicket(D, t) {
  let v = t.ticket !== '-' ? D.viajes.find((x) => x.ticket === t.ticket) : null;
  if (!v) {
    v = D.viajes.filter((x) => x.placa === t.placa && !x.ticket)
      .sort((a, b) => (a.fecha_despacho || '').localeCompare(b.fecha_despacho || '') || (a.despacho_en || '').localeCompare(b.despacho_en || '') || a.id - b.id)[0];
  }
  if (!v) return null;
  Object.assign(v, {
    ticket: t.ticket, peso_destino: t.peso, ingreso_en: t.ingreso, salida_en: t.salida,
    fecha_recepcion: t.ingreso ? t.ingreso.slice(0, 10) : v.fecha_recepcion,
    jornada_recepcion: t.ingreso ? C.jornadaDe(t.ingreso) : v.jornada_recepcion,
  });
  return v.id;
}

/* ---------------- importadores ---------------- */
export function importarDespachos(D, T, wb, usuario) {
  const found = findSheet(wb, [['Referencia', 'GUIA', 'GUIA R. HUACHO', 'GUIA REMISION'], ['Placa', 'PLACA']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "Referencia" (guía) y "Placa".');
  const res = { insertados: 0, duplicados: 0, sin_transportista: 0, omitidos: 0, errores: [] };
  const guias = new Set(D.viajes.map((v) => v.guia).filter(Boolean));
  for (const r of found.rows) {
    const guia = str(r.get('Referencia', 'GUIA R. HUACHO', 'GUIA', 'GUIA REMISION'));
    const placa = C.normPlaca(r.get('Placa', 'PLACA'));
    if (!guia || !placa) { if (guia || placa) res.omitidos++; continue; }
    if (guias.has(guia)) { res.duplicados++; continue; }
    const peso = toTn(r.get('P.Neto Ent. Ton', 'Peso TON', 'P.Neto Ton.', 'PESO TN X UNID HUACHO', 'P.Neto Ent.', 'Peso neto', 'PESO'));
    const salida = combinarFechaHora(r.get('FeActDpExp', 'FinActCarg', 'Fe.SM real', 'DIA DESPACHO', 'FECHA'), r.get('HrADpExp', 'HrAFCg', 'HORA'));
    const inicioCarga = combinarFechaHora(r.get('InActCarga', 'FeActDpExp', 'Fe.SM real', 'DIA DESPACHO', 'FECHA'), r.get('HrAICg', 'HrADpExp', 'HORA'));
    if (!salida) { res.errores.push(`Fila ${r._row}: sin fecha de despacho`); continue; }
    const tid = resolverTransportista(T, D, str(r.get('Número de transportista', 'TRANSPORTE', 'TRANSPORTISTA', 'Nombre transportista')), placa);
    if (!tid) res.sin_transportista++;
    asegurarParticipacion(D, tid);
    D.viajes.push(nuevoViaje(D, {
      transportista_id: tid, placa, fecha_despacho: (inicioCarga || salida).slice(0, 10),
      jornada_despacho: str(r.get('JORNADA DESPACHO', 'JORNADA')) || C.jornadaDe(inicioCarga || salida),
      despacho_en: salida, guia, peso_origen: peso,
    }, usuario));
    guias.add(guia);
    res.insertados++;
  }
  return res;
}

export function nuevoViaje(D, v, usuario) {
  return {
    id: nuevoId(D), transportista_id: null, placa: null, fecha_despacho: null, jornada_despacho: null, despacho_en: null, guia: null,
    peso_origen: null, fecha_recepcion: null, jornada_recepcion: null, ticket: null, peso_destino: null, ingreso_en: null, salida_en: null,
    rep_despacho: null, rep_acopio: null, observacion: null, ...v, creado_en: ahora(), creado_por: usuario || null,
  };
}

export function importarTickets(D, wb) {
  const found = findSheet(wb, [['PLACA'], ['TICKET', 'TICKET CSPCP', 'NRO TICKET'], ['PESO NETO', 'PESO', 'PESO TN', 'NETO']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "PLACA", "TICKET" y "PESO NETO".');
  const tickets = [];
  for (const r of found.rows) {
    const placa = C.normPlaca(r.get('PLACA'));
    const ticket = str(r.get('TICKET', 'TICKET CSPCP', 'NRO TICKET'));
    if (!placa || !ticket) continue;
    tickets.push({
      placa, ticket, peso: toTn(r.get('PESO NETO', 'PESO', 'PESO TN', 'NETO')),
      ingreso: C.normDT(str(r.get('TIEMPO INGRESO', 'HORA INGRESO', 'FECHA INGRESO', 'INGRESO'))),
      salida: C.normDT(str(r.get('TIEMPO SALIDA', 'HORA SALIDA', 'FECHA SALIDA', 'SALIDA'))),
    });
  }
  tickets.sort((a, b) => (C.toMs(a.ingreso) ?? 0) - (C.toMs(b.ingreso) ?? 0));
  const res = { procesados: tickets.length, asignados: 0, sin_viaje: [] };
  for (const t of tickets) { if (asignarTicket(D, t)) res.asignados++; else res.sin_viaje.push(`${t.placa} / ticket ${t.ticket}`); }
  return res;
}

export function importarLista(D, T, wb) {
  const found = findSheet(wb, [['TRACTO', 'PLACA'], ['RUC', 'TRANSPORTISTA']]);
  if (!found) throw new Error('No se encontró una hoja con columnas "TRACTO" y "RUC".');
  const res = { insertados: 0, actualizados: 0, sin_transportista: 0 };
  for (const r of found.rows) {
    const tracto = C.normPlaca(r.get('TRACTO', 'PLACA'));
    if (!tracto) continue;
    const ruc = str(r.get('RUC'));
    const tid = ruc ? T.find((t) => t.ruc === String(ruc))?.id ?? null : resolverTransportista(T, D, str(r.get('TRANSPORTISTA')), null);
    if (!tid) res.sin_transportista++;
    asegurarParticipacion(D, tid);
    const o = {
      transportista_id: tid, ap_paterno: str(r.get('AP. PATERNO', 'APELLIDO PATERNO')), ap_materno: str(r.get('AP. MATERNO', 'APELLIDO MATERNO')),
      nombre1: str(r.get('1ER NOMBRE', 'NOMBRES', 'NOMBRE')), nombre2: str(r.get('2DO NOMBRE')), dni: str(r.get('DNI')),
      brevete: str(r.get('BREVETE', 'LICENCIA')), tracto, plataforma: C.normPlaca(r.get('PLATAFORMA', 'CARRETA')) || null,
    };
    const e = D.unidades.find((u) => u.tracto === tracto);
    if (e) { Object.assign(e, o); res.actualizados++; } else { D.unidades.push({ id: nuevoId(D), ...o }); res.insertados++; }
  }
  return res;
}

function colLetra(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/**
 * Libro completo "REPORTE DE CONTROL UNIDADES SAL". Devuelve { operacion, D, transportistas, res }
 * donde transportistas son los del libro (para fusionar con el maestro) con ids provisionales por RUC.
 */
export function importarLibro(wb, T, usuario) {
  const sh = (n) => wb.worksheets.find((w) => normH(w.name) === normH(n));
  const cv = (ws, a) => (ws ? val(ws.getCell(a)) : null);
  const emb = sh('RESUMEN EMBARQUE'), det = sh('DETALLE TRANSPORTE'), pre = sh('PREACOPIO');
  if (!det) throw new Error('El libro no contiene la hoja "DETALLE TRANSPORTE".');
  const cab = wb.worksheets.find((w) => normH(cv(w, 'B4')) === normH('REPORTE DE SERVICIO TRANSPORTE') && cv(w, 'D5') && !w.getCell('D5').formula);
  const res = { avisos: [] };

  let coord = null;
  for (const w of wb.worksheets) {
    for (let r = 700; r <= Math.min(w.rowCount, 1000) && !coord; r++) {
      const t = str(cv(w, `B${r}`));
      if (t && /^APROBADO:/i.test(t)) coord = t.replace(/^APROBADO:\s*/i, '').trim() || null;
    }
    if (coord) break;
  }
  const operacion = {
    nave: str(cv(emb, 'C4')) || str(cv(cab, 'D5')) || 'SIN NOMBRE', orden: str(cv(emb, 'F4')) || 'S/N',
    manifiesto: str(cv(emb, 'C5')), dam: str(cv(emb, 'F5')) || str(cv(cab, 'H6')), eta: C.normDT(cv(emb, 'C6'), false),
    cliente: str(cv(cab, 'H5')), producto: str(cv(cab, 'D6')), referencia: str(cv(cab, 'H7')),
    punto_salida: str(cv(cab, 'D8')), punto_llegada: str(cv(cab, 'D9')), fecha_inicio: C.normDate(cv(cab, 'D7')),
    empresa: (str(cv(det, 'B2')) || 'PACIFICO DESPACHOS S.A.C.').trim(), coordinador: coord,
    tn_programadas: toNum(cv(det, 'S1')) || toNum(cv(pre, 'B7')) || 0,
    tn_embarque_programadas: toNum(cv(emb, 'C35')), tn_draft_sgs: toNum(cv(emb, 'G35')), estado: 'EN CURSO',
    params: JSON.stringify(pre ? {
      tn_x_unidad: toNum(cv(pre, 'B8')), viajes_x_hora: toNum(cv(pre, 'B10')), jornadas_x_dia: toNum(cv(pre, 'B13')),
      inicio_acopio: C.normDT(cv(pre, 'C15'), false), tn_x_hora_embarque: toNum(cv(pre, 'E8')), inicio_embarque: C.normDT(cv(pre, 'F13'), false),
      round_trip: [7, 8, 9, 10, 11, 12, 13, 14, 15].map((r) => {
        const t = cv(pre, `I${r}`);
        return { etapa: str(cv(pre, `H${r}`)), min: t instanceof Date ? t.getUTCHours() * 60 + t.getUTCMinutes() : toNum(t) };
      }).filter((x) => x.etapa),
    } : {}),
  };

  // Transportistas: se fusionan con el maestro T (por RUC). Los nuevos reciben id negativo provisional.
  const nuevosT = [];
  let prov = -1;
  const upT = (ruc, rs, nc) => {
    let t = T.find((x) => x.ruc === ruc) || nuevosT.find((x) => x.ruc === ruc);
    if (!t) { t = { id: prov--, ruc, razon_social: rs, nombre_comercial: nc, contacto: null, telefono: null, emails: null }; nuevosT.push(t); }
    else { t.razon_social = rs || t.razon_social; t.nombre_comercial = nc || t.nombre_comercial; }
    return t;
  };
  const TT = () => [...T, ...nuevosT];
  const D = { op_transportistas: [], unidades: [], viajes: [], reportes: [], etapas: [], seq: 0, historial: [] };
  const base = sh('BASE');
  if (base) for (let r = 4; r <= 40; r++) { const ruc = str(cv(base, `B${r}`)), rs = str(cv(base, `C${r}`)), nc = str(cv(base, `D${r}`)); if (ruc && rs && nc) upT(ruc, rs, nc); }
  const trs = sh('TRANSPORTISTAS');
  if (trs) {
    for (let r = 5; r <= 40; r++) {
      const nc = str(cv(trs, `B${r}`)), rs = str(cv(trs, `C${r}`)), ruc = str(cv(trs, `D${r}`));
      if (!nc || !ruc || normH(rs) === 'TOTAL') continue;
      const t = upT(ruc, rs || nc, nc);
      D.op_transportistas.push({ transportista_id: t.id, unidades_solicitadas: toNum(cv(trs, `E${r}`)) || 0, tn_prom_unidad: toNum(cv(trs, `G${r}`)) || 33,
        tn_asignadas: toNum(cv(trs, `AE${r}`)), reporte_confirmado: cv(trs, `N${r}`) ? 1 : 0, observacion: null });
      const hoja = sh(nc) || wb.worksheets.find((w) => normH(cv(w, 'K10')) === normH(nc));
      if (hoja) {
        const emails = ['O2', 'O3', 'O4', 'O5', 'O6'].map((a) => str(cv(hoja, a))).filter((x) => x && x.includes('@'));
        t.contacto = str(cv(hoja, 'O7')) || t.contacto; t.telefono = str(cv(hoja, 'O8')) || t.telefono;
        if (emails.length) t.emails = emails.join(', ');
      }
    }
  }
  const lista = sh('LISTA');
  if (lista) {
    for (const r of rowsByHeader(lista, [['TRACTO'], ['RUC']]) || []) {
      const tracto = C.normPlaca(r.get('TRACTO')); if (!tracto) continue;
      const tid = TT().find((t) => t.ruc === String(r.get('RUC') ?? ''))?.id ?? null;
      D.unidades.push({ id: nuevoId(D), transportista_id: tid, ap_paterno: str(r.get('AP. PATERNO')), ap_materno: str(r.get('AP. MATERNO')),
        nombre1: str(r.get('1ER NOMBRE')), nombre2: str(r.get('2DO NOMBRE')), dni: str(r.get('DNI')), brevete: str(r.get('BREVETE')),
        tracto, plataforma: C.normPlaca(r.get('PLATAFORMA')) || null });
    }
    res.unidades = D.unidades.length;
  }
  const salidaPorGuia = new Map();
  const hua = sh('REPORTE HUACHO');
  if (hua) for (const r of rowsByHeader(hua, [['Referencia'], ['Placa']]) || []) { const gg = str(r.get('Referencia')); if (gg) salidaPorGuia.set(gg, combinarFechaHora(r.get('FeActDpExp', 'Fe.SM real'), r.get('HrADpExp'))); }
  const tiempos = new Map();
  const csp = sh('REPORTE CSPCP');
  if (csp) for (const r of rowsByHeader(csp, [['PLACA'], ['TICKET']]) || []) { const t = str(r.get('TICKET')); if (t) tiempos.set(t, { ingreso: C.normDT(str(r.get('TIEMPO INGRESO'))), salida: C.normDT(str(r.get('TIEMPO SALIDA'))) }); }

  const guias = new Set();
  for (const r of rowsByHeader(det, [['DIA DESPACHO'], ['PLACA'], ['GUIA R. HUACHO']]) || []) {
    const fecha = C.normDate(r.get('DIA DESPACHO')), placa = C.normPlaca(r.get('PLACA'));
    if (!fecha || !placa) continue;
    let guia = str(r.get('GUIA R. HUACHO'));
    if (guia && guias.has(guia)) { res.avisos.push(`Guía duplicada ${guia} (fila ${r._row})`); guia = `${guia}#${r._row}`; }
    if (guia) guias.add(guia);
    const ticket = str(r.get('TICKET CSPCP'));
    const tt = ticket ? tiempos.get(ticket) : null;
    const tNom = str(r.get('TRANSPORTE'));
    const tid = resolverTransportista(TT(), D, tNom, placa);
    if (!tid) res.avisos.push(`Transportista no encontrado: ${tNom} (placa ${placa})`);
    asegurarParticipacion(D, tid);
    D.viajes.push(nuevoViaje(D, {
      transportista_id: tid, placa, fecha_despacho: fecha, jornada_despacho: str(r.get('JORNADA DESPACHO')),
      despacho_en: (guia && salidaPorGuia.get(guia)) || null, guia, peso_origen: toNum(r.get('PESO TN X UNID HUACHO')),
      fecha_recepcion: C.normDate(r.get('DIA RECEPCION')), jornada_recepcion: str(r.get('JORNADA RECEPCION')),
      ticket, peso_destino: ticket ? toNum(r.get('PESO TN X UNID CSPCP')) : null, ingreso_en: tt?.ingreso || null, salida_en: tt?.salida || null,
      rep_despacho: toNum(r.get('# REPORTE DESPACHO')), rep_acopio: toNum(r.get('# REPORTE ACOPIO')),
    }, usuario));
  }
  res.viajes = D.viajes.length;

  const cols = Array.from({ length: 30 }, (_, i) => colLetra(i + 2));
  const addR = (tipo, numero, inicio, fin, acum) => {
    D.reportes = D.reportes.filter((x) => !(x.tipo === tipo && x.numero === numero));
    D.reportes.push({ id: nuevoId(D), tipo, numero, inicio, fin, tn_acumulado: acum ?? null, observacion: null });
  };
  const rep = sh('REPORTES');
  if (rep) {
    for (const [tipo, rN, rI, rF] of [['despacho', 3, 5, 6], ['acopio', 34, 36, 37]]) {
      cols.forEach((c, i) => { const ini = C.normDT(cv(rep, `${c}${rI}`), false); if (ini) addR(tipo, toNum(cv(rep, `${c}${rN}`)) || i + 1, ini, C.normDT(cv(rep, `${c}${rF}`), false)); });
    }
  }
  if (emb) {
    cols.forEach((c, i) => {
      const ini = C.normDT(cv(emb, `${c}16`), false); if (!ini) return;
      addR('embarque', i + 1, ini, C.normDT(cv(emb, `${c}17`), false), i === 0 ? toNum(cv(emb, `${c}19`)) : toNum(cv(emb, `${c}25`)));
    });
    for (let r = 9; r <= 14; r++) {
      const nombre = str(cv(emb, `B${r}`)); if (!nombre) continue;
      D.etapas.push({ id: nuevoId(D), nombre, inicio: C.normDT(cv(emb, `C${r}`), false), fin: C.normDT(cv(emb, `D${r}`), false), observacion: str(cv(emb, `G${r}`)) });
    }
  }
  return { operacion, D, nuevosT, res };
}

/* ---------------- exportación ---------------- */
const AZUL = 'FF1F3A5F';
const head = (row) => {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  row.height = 30;
};
const COLS = [
  ['DIA DESPACHO', 'fecha_despacho', 13], ['JORNADA DESPACHO', 'jornada_despacho', 15], ['NRO. VIAJE', 'nro', 8],
  ['TRANSPORTE', 'transportista_nombre', 18], ['PLACA', 'placa', 10], ['GUIA R.', 'guia', 19],
  ['PESO TN ORIGEN', 'peso_origen', 11], ['DIA RECEPCION', 'fecha_recepcion', 13], ['JORNADA RECEPCION', 'jornada_recepcion', 15],
  ['TICKET', 'ticket', 15], ['PESO TN DESTINO', 'peso_destino_calc', 11], ['REDONDEO X TN DEV', 'redondeo', 11],
  ['DIFERENCIA', 'diferencia', 10], ['CANT. ACUM. TN', 'acumulado', 12], ['CANT. REST. TN', 'restante', 12],
  ['TIPO DE VIAJE', 'tipo', 13], ['HORA INGRESO', 'ingreso_en', 18], ['HORA SALIDA', 'salida_en', 18],
  ['TIEMPO (MIN)', 'tiempo_min', 9], ['RANGO', 'rango', 15], ['# REPORTE DESPACHO', 'rep_despacho_calc', 10],
  ['# REPORTE ACOPIO', 'rep_acopio_calc', 10], ['VIAJE X UNIDAD', 'vuelta', 9], ['STATUS', 'status', 16],
];
function titulo(ws, op, texto, n) {
  ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = op.empresa || 'PACIFICO DESPACHOS S.A.C.';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = `${texto} — ${op.nave} / ORDEN ${op.orden}`;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
}
const rd = (n) => Math.round(n * 1000) / 1000;
const blob = async (wb) => new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

export async function exportarDetalle(op, viajes, tot) {
  const wb = new (XL().Workbook)();
  const ws = wb.addWorksheet('DETALLE TRANSPORTE', { views: [{ state: 'frozen', ySplit: 5 }] });
  titulo(ws, op, 'DETALLE TRANSPORTE', COLS.length);
  ws.getCell('A3').value = `TN programadas: ${tot.tn_programadas}  |  TN despacho: ${tot.tn_despacho}  |  TN acopio: ${tot.tn_acopio}  |  Viajes: ${tot.viajes}`;
  ws.getRow(5).values = COLS.map((c) => c[0]); head(ws.getRow(5));
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  for (const v of viajes) ws.addRow(COLS.map((c) => v[c[1]] ?? ''));
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };
  return blob(wb);
}

export async function exportarTransportista(op, t, viajes) {
  const wb = new (XL().Workbook)();
  const ws = wb.addWorksheet(String(t.nombre_comercial).slice(0, 31));
  const cols = COLS.slice(0, 11);
  titulo(ws, op, 'REPORTE DE SERVICIO TRANSPORTE', cols.length);
  const sum = (k) => rd(viajes.reduce((s, v) => s + (v[k] || 0), 0));
  [
    ['VAPOR:', op.nave, 'CLIENTE:', op.cliente], ['PRODUCTO:', op.producto, 'DAM:', op.dam],
    ['FECHA INICIO:', op.fecha_inicio, 'REFERENCIA:', op.referencia], ['PUNTO SALIDA:', op.punto_salida, 'TOTAL VIAJES:', viajes.length],
    ['PUNTO LLEGADA:', op.punto_llegada, 'TOTAL PESO TM ORIGEN:', sum('peso_origen')], ['EMPRESA DE TRANSPORTE:', t.razon_social, 'RUC:', t.ruc],
    ['', '', 'TOTAL PESO TM DESTINO:', sum('peso_destino_calc')],
  ].forEach((r, i) => {
    const row = ws.getRow(4 + i);
    row.getCell(1).value = r[0]; row.getCell(3).value = r[1] ?? ''; row.getCell(7).value = r[2]; row.getCell(9).value = r[3] ?? '';
    row.getCell(1).font = row.getCell(7).font = { bold: true };
  });
  ws.getRow(12).values = cols.map((c) => c[0]); head(ws.getRow(12));
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  const orden = [...viajes].sort((a, b) => a.nro - b.nro);
  for (const v of orden) ws.addRow(cols.map((c) => v[c[1]] ?? ''));
  ws.addRow(['Total', '', orden.length, '', '', '', sum('peso_origen'), '', '', '', sum('peso_destino_calc')]).font = { bold: true };
  ws.addRow([]);
  ws.addRow(['** CONFORMIDAD ACEPTADA **', '', '', '', '', '', '', '', '', op.coordinador || '']);
  ws.addRow(['FECHA:', '', '', '', '', '', '', '', '', 'Coordinador de Transporte']);
  ws.addRow([`APROBADO: ${op.coordinador || ''}`, '', '', '', '', '', '', '', '', op.empresa || '']);
  return blob(wb);
}
