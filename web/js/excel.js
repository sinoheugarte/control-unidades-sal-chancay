// Importación y exportación de Excel en el navegador (ExcelJS).
// Trabaja sobre objetos en memoria: D = datos de una operación, T = maestro de transportistas.
import * as C from './calc.js?v=__V__';

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
/** Busca la hoja con esas columnas; primero en las hojas con nombre preferido (p. ej. "REPORTE HUACHO"). */
function findSheet(wb, required, preferidas = [], excluir = []) {
  const ex = excluir.map(normH);
  const pref = preferidas.map(normH);
  const hojas = wb.worksheets.filter((w) => !ex.includes(normH(w.name)));
  const orden = [...hojas.filter((w) => pref.includes(normH(w.name))), ...hojas.filter((w) => !pref.includes(normH(w.name)))];
  for (const ws of orden) { const rows = rowsByHeader(ws, required); if (rows) return { ws, rows }; }
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
/** Compara nombres de empresa ignorando mayúsculas, espacios y puntuación ("S.A.C." = "SAC"). */
export const mismoNombre = (a, b) => !!a && !!b && normH(a) === normH(b);

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
  D.op_transportistas.push({ transportista_id: tid, unidades_solicitadas: 0, tn_prom_unidad: 33, tn_asignadas: null, vueltas_manual: {}, reporte_confirmado: 0, observacion: null });
}
const nuevoId = (D) => { D.seq = (D.seq || 0) + 1; return D.seq; };
const ahora = () => C.fmtDT(Date.now() - new Date().getTimezoneOffset() * 60000, true);

/* ---------------- cruce planta (HUACHO) ↔ puerto (CSPCP) ----------------
   Igual que el Excel (INDEX/MATCH por PLACA + VUELTA): el n-ésimo ticket de una placa,
   en orden de ingreso al puerto, corresponde al n-ésimo viaje de esa placa. Los tickets
   se guardan aparte (D.tickets), así que no importa en qué orden se importen los reportes. */

function aplicarTicket(v, t, completar) {
  const turno = C.turnoDe(t.ingreso);
  Object.assign(v, { ticket: t.ticket, peso_destino: t.peso, ingreso_en: t.ingreso, salida_en: t.salida });
  if (!completar || !v.fecha_recepcion) v.fecha_recepcion = turno.fecha || v.fecha_recepcion;
  if (!completar || !v.jornada_recepcion) v.jornada_recepcion = turno.jornada || v.jornada_recepcion;
}

/** Vuelve a cruzar los tickets guardados con los viajes. Devuelve los tickets que siguen sin viaje. */
export function conciliar(D) {
  D.tickets = D.tickets || [];
  const porTicket = new Map(D.viajes.filter((v) => v.ticket && v.ticket !== '-').map((v) => [v.ticket, v]));
  let asignados = 0;
  const sinViaje = [];
  const pendientes = [...D.tickets].sort((a, b) => (C.toMs(a.ingreso) ?? 0) - (C.toMs(b.ingreso) ?? 0));
  for (const t of pendientes) {
    const v = porTicket.get(t.ticket);
    if (v) { // ya cruzado: actualizar peso y horas si el reporte trae correcciones
      if (v.peso_destino !== t.peso || v.ingreso_en !== t.ingreso || v.salida_en !== t.salida) aplicarTicket(v, t, true);
      continue;
    }
    const libre = D.viajes.filter((x) => x.placa === t.placa && !x.ticket).sort((a, b) => a.id - b.id)[0];
    if (libre) { aplicarTicket(libre, t, false); porTicket.set(t.ticket, libre); asignados++; } else sinViaje.push(t);
  }
  return { asignados, sin_viaje: sinViaje };
}

function guardarTicket(D, t) {
  D.tickets = D.tickets || [];
  const e = D.tickets.find((x) => x.ticket === t.ticket);
  if (!e) { D.tickets.push({ ...t }); return 'nuevo'; }
  if (e.placa === t.placa && e.peso === t.peso && e.ingreso === t.ingreso && e.salida === t.salida) return 'igual';
  Object.assign(e, t);
  return 'actualizado';
}

/** Recepción manual (o devolución con ticket "-"). Devuelve el id del viaje o null. */
export function asignarTicket(D, t) {
  if (t.ticket !== '-') {
    guardarTicket(D, t);
    const antes = D.viajes.find((x) => x.ticket === t.ticket);
    if (antes) { aplicarTicket(antes, t, false); return antes.id; }
  }
  const v = D.viajes.filter((x) => x.placa === t.placa && !x.ticket).sort((a, b) => a.id - b.id)[0];
  if (!v) { if (t.ticket !== '-') D.tickets = D.tickets.filter((x) => x.ticket !== t.ticket); return null; }
  aplicarTicket(v, t, false);
  return v.id;
}

/* ---------------- importadores ---------------- */
/** Columna del REPORTE HUACHO (SAP) con el nombre de la empresa de transporte. */
const COL_TRANSP_HUACHO = ['Número de transportista', 'Numero de transportista', 'TRANSPORTE', 'TRANSPORTISTA', 'Nombre transportista', 'Empresa de transporte'];

/** Empresas de transporte que aparecen en un REPORTE HUACHO (razón social), para crearlas si no existen. */
export function transportistasEnDespachos(wb) {
  const found = findSheet(wb, [['Referencia', 'GUIA R. HUACHO', 'GUIA REMISION', 'GUIA'], ['Placa', 'PLACA']], ['REPORTE HUACHO'], ['DETALLE TRANSPORTE']);
  if (!found) return [];
  const nombres = new Map();
  for (const r of found.rows) {
    const n = str(r.get(...COL_TRANSP_HUACHO));
    if (n && !/^\d+$/.test(n)) nombres.set(normH(n), n.toUpperCase().replace(/\s+/g, ' ').trim());
  }
  return [...nombres.values()];
}

/** Asigna empresa a los viajes que no la tienen, usando la placa (LISTA u otros viajes). Devuelve cuántos se completaron. */
export function completarTransportistas(D, T) {
  let n = 0;
  for (const v of D.viajes) {
    if (v.transportista_id) continue;
    const tid = resolverTransportista(T, D, null, v.placa);
    if (tid) { v.transportista_id = tid; asegurarParticipacion(D, tid); n++; }
  }
  return n;
}

/** REPORTE HUACHO (exportación SAP de despachos de planta). Acumulativo: las guías ya cargadas se actualizan. */
export function importarDespachos(D, T, wb, usuario) {
  const found = findSheet(wb, [['Referencia', 'GUIA R. HUACHO', 'GUIA REMISION', 'GUIA'], ['Placa', 'PLACA']], ['REPORTE HUACHO'], ['DETALLE TRANSPORTE']);
  if (!found) throw new Error('No se encontró la tabla del reporte de planta: debe tener las columnas "Referencia" (guía) y "Placa" (hoja "REPORTE HUACHO" o exportación SAP).');
  const res = { filas: 0, insertados: 0, actualizados: 0, sin_cambios: 0, sin_transportista: [], omitidos: 0, errores: [] };
  const porGuia = new Map(D.viajes.filter((v) => v.guia).map((v) => [v.guia, v]));
  for (const r of found.rows) {
    const guia = str(r.get('Referencia', 'GUIA R. HUACHO', 'GUIA REMISION', 'GUIA'));
    const placa = C.normPlaca(r.get('Placa', 'PLACA'));
    if (!guia && !placa) continue;
    res.filas++;
    if (!guia || !placa) { res.omitidos++; res.errores.push(`Fila ${r._row}: falta ${!guia ? 'la guía' : 'la placa'}`); continue; }
    const peso = toTn(r.get('Peso TON', 'P.Neto Ent. Ton', 'P.Neto Ton.', 'PESO TN X UNID HUACHO', 'P.Neto Ent.', 'Peso neto', 'PESO'));
    const salida = combinarFechaHora(r.get('FeActDpExp', 'FinActCarg', 'Fe.SM real', 'DIA DESPACHO', 'FECHA'), r.get('HrADpExp', 'HrAFCg', 'HORA'));
    if (!salida) { res.omitidos++; res.errores.push(`Fila ${r._row} (guía ${guia}): sin fecha de despacho`); continue; }
    const e = porGuia.get(guia);
    const nombreT = str(r.get(...COL_TRANSP_HUACHO));
    if (e) {
      // Completa la empresa si el viaje quedó sin transportista en una carga anterior
      const tidE = e.transportista_id || resolverTransportista(T, D, nombreT, placa);
      // Día y jornada de despacho = hora de salida (la misma que usan los reportes de avance)
      const tE = C.turnoDe(salida);
      const fE = C.normDate(r.get('DIA DESPACHO')) || tE.fecha, jE = str(r.get('JORNADA DESPACHO', 'JORNADA')) || tE.jornada;
      if (e.placa === placa && e.peso_origen === peso && e.despacho_en === salida && e.transportista_id === tidE && e.fecha_despacho === fE && e.jornada_despacho === jE) { res.sin_cambios++; continue; }
      Object.assign(e, { placa, peso_origen: peso, despacho_en: salida, transportista_id: tidE || null, fecha_despacho: fE, jornada_despacho: jE });
      asegurarParticipacion(D, tidE);
      res.actualizados++;
      continue;
    }
    const tid = resolverTransportista(T, D, nombreT, placa);
    if (!tid) res.sin_transportista.push(`${placa} (${nombreT || 'sin nombre'})`);
    asegurarParticipacion(D, tid);
    // Día y jornada según la hora de despacho (salida de planta), la misma que usan los reportes de avance,
    // para que la tabla por jornada y los cortes cuadren. El turno de las 23:00 cuenta para el día siguiente.
    const turno = C.turnoDe(salida);
    const nv = nuevoViaje(D, {
      transportista_id: tid, placa, fecha_despacho: C.normDate(r.get('DIA DESPACHO')) || turno.fecha,
      jornada_despacho: str(r.get('JORNADA DESPACHO', 'JORNADA')) || turno.jornada,
      despacho_en: salida, guia, peso_origen: peso,
    }, usuario);
    D.viajes.push(nv);
    porGuia.set(guia, nv);
    res.insertados++;
  }
  const c = conciliar(D);
  res.tickets_cruzados = c.asignados;
  res.tickets_sin_viaje = c.sin_viaje.length;
  res.completados = completarTransportistas(D, T);
  res.sin_transportista = [...new Set(res.sin_transportista)];
  return res;
}

export function nuevoViaje(D, v, usuario) {
  return {
    id: nuevoId(D), transportista_id: null, placa: null, fecha_despacho: null, jornada_despacho: null, despacho_en: null, guia: null,
    peso_origen: null, fecha_recepcion: null, jornada_recepcion: null, ticket: null, peso_destino: null, ingreso_en: null, salida_en: null,
    rep_despacho: null, rep_acopio: null, observacion: null, ...v, creado_en: ahora(), creado_por: usuario || null,
  };
}

/* Columnas del reporte del puerto (CSPCP). Acepta la hoja REPORTE CSPCP del libro de control y la
   exportación del sistema del puerto en inglés (NZ-BTOS: License plate number, Ticket number, Net Weight,
   Entry time, Exit time). */
const CSP = {
  placa: ['PLACA', 'License plate number', 'License plate', 'Plate number', 'Plate', 'Truck plate'],
  ticket: ['TICKET', 'TICKET CSPCP', 'NRO TICKET', 'Ticket number', 'Ticket No', 'Ticket'],
  peso: ['PESO NETO', 'PESO', 'PESO TN', 'NETO', 'Net Weight', 'Net weight (t)', 'Net'],
  ingreso: ['TIEMPO INGRESO', 'HORA INGRESO', 'FECHA INGRESO', 'INGRESO', 'Entry time', 'Ingate time', 'In time'],
  salida: ['TIEMPO SALIDA', 'HORA SALIDA', 'FECHA SALIDA', 'SALIDA', 'Exit time', 'Outgate time', 'Out time'],
};
function leerTickets(wb) {
  const found = findSheet(wb, [CSP.placa, CSP.ticket, CSP.peso], ['REPORTE CSPCP'], ['DETALLE TRANSPORTE']);
  if (!found) throw new Error('No se encontró la tabla del reporte del puerto: debe tener la placa (PLACA / License plate number), el ticket (TICKET / Ticket number) y el peso neto (PESO NETO / Net Weight).');
  const out = [];
  for (const r of found.rows) {
    const placa = C.normPlaca(r.get(...CSP.placa));
    const ticket = str(r.get(...CSP.ticket));
    if (!placa || !ticket) continue;
    const fh = (v) => (v instanceof Date ? C.normDT(v) : C.normDT(str(v)));
    out.push({
      placa, ticket, peso: toTn(r.get(...CSP.peso)),
      ingreso: fh(r.get(...CSP.ingreso)),
      salida: fh(r.get(...CSP.salida)),
    });
  }
  return out;
}

/** REPORTE CSPCP (tickets de balanza del puerto). Acumulativo: los tickets ya cargados se actualizan. */
export function importarTickets(D, wb) {
  const res = { filas: 0, nuevos: 0, actualizados: 0, sin_cambios: 0 };
  for (const t of leerTickets(wb)) { res.filas++; const k = guardarTicket(D, t); res[k === 'nuevo' ? 'nuevos' : k === 'actualizado' ? 'actualizados' : 'sin_cambios']++; }
  const c = conciliar(D);
  res.asignados = c.asignados;
  res.sin_viaje = c.sin_viaje.map((t) => `${t.placa} · ticket ${t.ticket} · ${t.ingreso || ''}`);
  return res;
}

/* ---------------- LISTA de transportistas, conductores y unidades ----------------
   Acepta la hoja LISTA del libro de control y las listas que envían los transportistas, con
   distintos nombres de columna. Se leen TODAS las hojas del archivo que tengan placa + datos
   del conductor. Varios archivos se integran a la lista existente sin duplicar. */
const AL = {
  tracto: ['TRACTO', 'PLACA TRACTO', 'PLACA DEL TRACTO', 'PLACA TRACTO CAMION', 'PLACA', 'PLACA VEHICULO', 'VEHICULO', 'UNIDAD', 'PLACA UNIDAD', 'CAMION', 'PLACA CAMION'],
  plataforma: ['PLATAFORMA', 'PLACA PLATAFORMA', 'CARRETA', 'PLACA CARRETA', 'SEMIREMOLQUE', 'SEMI REMOLQUE', 'PLACA SEMIREMOLQUE', 'REMOLQUE', 'PLACA REMOLQUE', 'TOLVA', 'PLACA TOLVA', 'ACOPLADO'],
  ruc: ['RUC', 'RUC TRANSPORTISTA', 'RUC EMPRESA', 'N RUC', 'NRO RUC'],
  empresa: ['TRANSPORTISTA', 'EMPRESA', 'RAZON SOCIAL', 'EMPRESA DE TRANSPORTE', 'EMPRESA TRANSPORTE', 'EMPRESA TRANSPORTISTA', 'NOMBRE COMERCIAL', 'TRANSPORTE'],
  paterno: ['AP. PATERNO', 'APELLIDO PATERNO', 'AP PATERNO', 'PATERNO'],
  materno: ['AP. MATERNO', 'APELLIDO MATERNO', 'AP MATERNO', 'MATERNO'],
  nombre1: ['1ER NOMBRE', 'PRIMER NOMBRE', 'NOMBRES', 'NOMBRE'],
  nombre2: ['2DO NOMBRE', 'SEGUNDO NOMBRE'],
  apellidos: ['APELLIDOS'],
  completo: ['APELLIDOS Y NOMBRES', 'NOMBRES Y APELLIDOS', 'CONDUCTOR', 'NOMBRE DEL CONDUCTOR', 'NOMBRE COMPLETO', 'NOMBRE CONDUCTOR', 'NOMBRE DEL CHOFER', 'APELLIDOS Y NOMBRES DEL CONDUCTOR'],
  dni: ['DNI', 'N DNI', 'NRO DNI', 'DNI CONDUCTOR', 'DOCUMENTO', 'NRO DOCUMENTO', 'DOC IDENTIDAD', 'DOCUMENTO DE IDENTIDAD'],
  brevete: ['BREVETE', 'LICENCIA', 'N LICENCIA', 'NRO LICENCIA', 'LICENCIA DE CONDUCIR', 'N BREVETE'],
};
const palabras = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
/** "PEREZ GOMEZ, JUAN CARLOS" | "PEREZ GOMEZ JUAN CARLOS" -> partes del nombre. */
function partirNombre(v, nombresPrimero = false) {
  const t = String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!t) return {};
  if (t.includes(',')) {
    const [ap, no] = t.split(',').map((x) => x.trim());
    const a = palabras(ap), n = palabras(no);
    return { ap_paterno: a[0] || null, ap_materno: a.slice(1).join(' ') || null, nombre1: n[0] || null, nombre2: n.slice(1).join(' ') || null };
  }
  const w = palabras(t);
  if (nombresPrimero) { // "JUAN CARLOS PEREZ GOMEZ": últimas 2 palabras = apellidos
    const ap = w.slice(-2), no = w.slice(0, -2);
    return { ap_paterno: ap[0] || null, ap_materno: ap[1] || null, nombre1: no[0] || null, nombre2: no.slice(1).join(' ') || null };
  }
  return { ap_paterno: w[0] || null, ap_materno: w[1] || null, nombre1: w[2] || null, nombre2: w.slice(3).join(' ') || null };
}
function normDni(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = String(typeof v === 'number' ? Math.round(v) : v).replace(/\D/g, '');
  if (!d) return null;
  return d.length < 8 ? d.padStart(8, '0') : d;
}

/** Lee las filas de LISTA de un libro: [{ ruc, empresa, ap_paterno, ..., tracto, plataforma }]. */
export function leerLista(wb) {
  const filas = [], hojas = [], avisos = [];
  for (const ws of wb.worksheets) {
    if (['DETALLE TRANSPORTE', 'REPORTE HUACHO', 'REPORTE CSPCP', 'TRANSPORTISTAS', 'BASE'].map(normH).includes(normH(ws.name))) continue;
    const rows = rowsByHeader(ws, [AL.tracto, [...AL.dni, ...AL.brevete, ...AL.paterno, ...AL.completo, ...AL.apellidos]], 25);
    if (!rows) continue;
    let n = 0;
    for (const r of rows) {
      const tracto = C.normPlaca(r.get(...AL.tracto));
      const dni = normDni(r.get(...AL.dni));
      if (!tracto && !dni) continue;
      if (tracto && !/[A-Z0-9]{5,7}/.test(tracto)) { avisos.push(`${ws.name}, fila ${r._row}: placa "${tracto}" no válida`); continue; }
      let nom = { ap_paterno: str(r.get(...AL.paterno)), ap_materno: str(r.get(...AL.materno)), nombre1: str(r.get(...AL.nombre1)), nombre2: str(r.get(...AL.nombre2)) };
      if (!nom.ap_paterno) {
        const ap = str(r.get(...AL.apellidos));
        if (ap) { const a = palabras(ap); nom.ap_paterno = a[0]; nom.ap_materno = a.slice(1).join(' ') || null; const nn = palabras(nom.nombre1); nom.nombre1 = nn[0] || null; nom.nombre2 = nn.slice(1).join(' ') || nom.nombre2; }
        else if (str(r.get(...AL.completo))) nom = partirNombre(r.get(...AL.completo));
      }
      const up = (x) => (x ? String(x).toUpperCase().replace(/\s+/g, ' ').trim() : null);
      const brevete = str(r.get(...AL.brevete));
      const ruc = normDni(r.get(...AL.ruc));
      filas.push({
        hoja: ws.name, fila: r._row, ruc: ruc && ruc.length === 11 ? ruc : null, empresa: up(str(r.get(...AL.empresa))),
        ap_paterno: up(nom.ap_paterno), ap_materno: up(nom.ap_materno), nombre1: up(nom.nombre1), nombre2: up(nom.nombre2),
        dni, brevete: brevete ? String(brevete).toUpperCase().replace(/\s+/g, '') : null, tracto: tracto || null,
        plataforma: C.normPlaca(r.get(...AL.plataforma)) || null,
      });
      n++;
    }
    if (n) hojas.push(`${ws.name} (${n})`);
  }
  return { filas, hojas, avisos };
}

/** Deriva un nombre comercial corto a partir de la razón social (TOLVEROS S.R.L. -> TOLVEROS). */
export function nombreComercialDe(rs, usados = []) {
  let b = String(rs || 'TRANSPORTISTA').toUpperCase()
    .replace(/\b(S\.?\s?A\.?\s?C\.?|S\.?\s?R\.?\s?L\.?|E\.?\s?I\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?A\.?|S\.?\s?A\.?|LTDA\.?|SOCIEDAD ANONIMA CERRADA)\s*$/g, '')
    .replace(/^(EMPRESA DE TRANSPORTES?|TRANSPORTES|GRUPO)\s+/, '').replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/)
    .filter((w) => !['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E'].includes(w)).slice(0, 2).join('_') || 'TRANSPORTISTA';
  let n = b, k = 2;
  while (usados.includes(n)) n = `${b}_${k++}`;
  return n;
}

/**
 * Integra filas leídas a D.unidades sin duplicar. tidDe(fila) devuelve el id del transportista.
 * Coincidencia: mismo DNI (el conductor cambió de unidad) o, sin DNI, misma placa de tracto.
 * Sólo se completan/reemplazan los campos que vienen con dato.
 */
export function integrarLista(D, filas, tidDe) {
  const res = { leidas: filas.length, insertados: 0, actualizados: 0, sin_cambios: 0, sin_transportista: [], repetidas_en_archivo: 0 };
  const vistos = new Set();
  for (const f of filas) {
    const clave = f.dni ? `D${f.dni}` : `T${f.tracto}`;
    if (vistos.has(clave)) res.repetidas_en_archivo++;
    vistos.add(clave);
    const tid = tidDe(f);
    if (!tid) res.sin_transportista.push(`${f.hoja} fila ${f.fila}: ${f.tracto || ''} ${f.dni || ''} (${f.empresa || f.ruc || 'sin empresa'})`);
    asegurarParticipacion(D, tid);
    const datos = { transportista_id: tid || null, ap_paterno: f.ap_paterno, ap_materno: f.ap_materno, nombre1: f.nombre1, nombre2: f.nombre2,
      dni: f.dni, brevete: f.brevete, tracto: f.tracto, plataforma: f.plataforma };
    const e = (f.dni && D.unidades.find((u) => u.dni === f.dni)) || (!f.dni && f.tracto && D.unidades.find((u) => u.tracto === f.tracto && !u.dni))
      || (f.tracto && !f.dni && D.unidades.find((u) => u.tracto === f.tracto));
    if (!e) { D.unidades.push({ id: nuevoId(D), ...datos }); res.insertados++; continue; }
    let cambio = false;
    for (const [k, v] of Object.entries(datos)) if (v !== null && v !== undefined && v !== '' && e[k] !== v) { e[k] = v; cambio = true; }
    if (cambio) res.actualizados++; else res.sin_cambios++;
  }
  return res;
}

/** Compatibilidad: importar una lista desde un solo libro (transportistas ya existentes). */
export function importarLista(D, T, wb) {
  const { filas } = leerLista(wb);
  if (!filas.length) throw new Error('No se encontraron columnas de placa (TRACTO/PLACA) y del conductor (DNI, BREVETE o nombres).');
  return integrarLista(D, filas, (f) => (f.ruc && T.find((t) => t.ruc === f.ruc)?.id) || resolverTransportista(T, D, f.empresa, f.tracto));
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
  if (!det) {
    const pista = findSheet(wb, [['Referencia'], ['Placa']]) ? 'Este archivo parece un REPORTE HUACHO (despachos de planta).'
      : findSheet(wb, [CSP.placa, CSP.ticket]) ? 'Este archivo parece un REPORTE CSPCP (tickets del puerto).'
        : findSheet(wb, [AL.tracto, [...AL.dni, ...AL.brevete]]) ? 'Este archivo parece una LISTA de conductores y unidades.' : null;
    throw new Error(pista
      ? `${pista} "Libro completo" es sólo para migrar un libro de control (.xlsm con la hoja DETALLE TRANSPORTE). Primero cree la operación en Operaciones → + Nueva operación y luego impórtelo en su tarjeta de Importar datos.`
      : 'El libro no contiene la hoja "DETALLE TRANSPORTE". "Libro completo" es sólo para migrar un libro de control (.xlsm). Para una operación nueva use Operaciones → + Nueva operación.');
  }
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
      // Vueltas escritas a mano (P:AD sin fórmula) = valores manuales; las de fórmula se recalculan en la app.
      const vueltas_manual = {};
      for (let i = 0; i < 15; i++) {
        const cell = trs.getCell(r, 16 + i);
        if (typeof cell.value === 'number') vueltas_manual[i + 1] = cell.value;
      }
      D.op_transportistas.push({ transportista_id: t.id, unidades_solicitadas: toNum(cv(trs, `E${r}`)) || 0, tn_prom_unidad: toNum(cv(trs, `G${r}`)) || 33,
        tn_asignadas: null, vueltas_manual, reporte_confirmado: cv(trs, `N${r}`) ? 1 : 0, observacion: null });
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
  try { D.tickets = leerTickets(wb); } catch { D.tickets = []; }
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
// Columnas VISIBLES de la hoja DETALLE TRANSPORTE del libro original (la columna oculta REDONDEO X TN DEV
// no se muestra: la app la calcula internamente para el TN final por transportista).
export const COLS_DETALLE = [
  ['DIA DESPACHO', 'fecha_despacho', 12, 'f'], ['JORNADA DESPACHO', 'jornada_despacho', 14], ['NRO. VIAJE', 'nro', 8, 'i'],
  ['TRANSPORTE', 'transportista_nombre', 17], ['PLACA', 'placa', 9], ['GUIA R. HUACHO', 'guia', 18],
  ['PESO TN X UNID HUACHO', 'peso_origen', 11, 'n'], ['DIA RECEPCION', 'fecha_recepcion', 12, 'f'], ['JORNADA RECEPCION', 'jornada_recepcion', 14],
  ['TICKET CSPCP', 'ticket', 14], ['PESO TN X UNID CSPCP', 'peso_destino_calc', 11, 'n'],
  ['DIFERENCIA HUACHO - CSPCP', 'diferencia', 11, 'n'], ['CANT. ACUM.TN', 'acumulado', 11, 'n'], ['CANT. REST. TN', 'restante', 11, 'n'],
  ['TIPO DE VIAJE', 'tipo', 13], ['HORA INGRESO CSPCP', 'ingreso_en', 17, 'dt'], ['HORA SALIDA CSPCP', 'salida_en', 17, 'dt'],
  ['TIEMPO', 'tiempo_min', 9, 'h'], ['RANGO', 'rango', 15], ['# REPORTE DESPACHO', 'rep_despacho_calc', 10, 'i'],
  ['# REPORTE ACOPIO', 'rep_acopio_calc', 10, 'i'], ['VIAJE X UNIDAD', 'vuelta', 9, 'i'], ['CONTEO', 'conteo', 8, 'i'], ['STATUS', 'status', 16],
];
// Columnas VISIBLES de las hojas por transportista (TOLVEROS, RIAR, ...).
// En el libro original DIA RECEPCION y JORNADA RECEPCION (columnas I-J) están ocultas, por eso no se incluyen.
export const COLS_TRANSP = [
  ['DIA DESPACHO', 'fecha_despacho', 13, 'f'], ['JORNADA DESPACHO', 'jornada_despacho', 15], ['NRO. VIAJE', 'nro', 10, 'i'],
  ['TRANSPORTE', 'transportista_nombre', 18], ['PLACA', 'placa', 10], ['GUIA R.', 'guia', 19], ['PESO X UNID HUACHO', 'peso_origen', 14, 'n'],
  ['TICKET CSPCP', 'ticket', 15], ['PESO X UNID CSPCP', 'peso_destino_calc', 14, 'n'],
];

/** Valor de celda: fechas como fecha de Excel, tiempos como h:mm:ss, números como número. */
export function valorCelda(v, k, tipo) {
  const x = k === 'conteo' ? 1 : v[k];
  if (x === null || x === undefined || x === '') return null;
  if (tipo === 'f' || tipo === 'dt') { const ms = C.toMs(x); return ms === null ? x : new Date(ms); }
  if (tipo === 'h') return x / 1440;
  return x;
}
const FMT = { f: 'dd/mm/yyyy', dt: 'dd/mm/yyyy hh:mm:ss', h: '[h]:mm:ss', n: '#,##0.00', i: '0' };

const AZUL = 'FF1F4E79';
const borde = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
function cabecera(row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = borde;
  });
  row.height = 32;
}
const rd = (n) => Math.round(n * 1000) / 1000;
const suma = (vs, k) => rd(vs.reduce((s, v) => s + (Number(v[k]) || 0), 0));
const blob = async (wb) => new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

let logoB64 = null;
export async function logoBase64() {
  if (logoB64 !== null) return logoB64;
  try {
    const b = await (await fetch('img/logo.png')).blob();
    logoB64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  } catch { logoB64 = ''; }
  return logoB64;
}

function filasDatos(ws, cols, viajes, desdeCol) {
  for (const v of viajes) {
    const row = ws.addRow([...Array(desdeCol - 1).fill(null), ...cols.map(([, k, , t]) => valorCelda(v, k, t))]);
    cols.forEach(([, , , t], i) => {
      const c = row.getCell(desdeCol + i);
      c.border = borde; c.font = { size: 9 };
      if (FMT[t]) c.numFmt = FMT[t];
      if (t && t !== 'f' && t !== 'dt') c.alignment = { horizontal: 'right' };
    });
  }
}

/** DETALLE TRANSPORTE (matriz completa). */
export async function exportarDetalle(op, viajes, tot) {
  const wb = new (XL().Workbook)();
  wb.creator = op.empresa || 'Control de Unidades';
  const ws = wb.addWorksheet('DETALLE TRANSPORTE', { views: [{ state: 'frozen', ySplit: 6 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 } });
  const logo = await logoBase64();
  if (logo) ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: 0.1, row: 0.1 }, ext: { width: 120, height: 66 } });
  ws.getCell('C2').value = (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim();
  ws.getCell('C2').font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.getCell('C3').value = `DETALLE TRANSPORTE — ${op.nave} / ORDEN ${op.orden}`;
  ws.getCell('C3').font = { bold: true, size: 11 };
  const res = [
    ['K', '# VIAJES', tot.viajes, '0'], ['K', 'TN DESPACHO', tot.tn_despacho, FMT.n], ['K', 'PESO PROM.', tot.peso_prom_unidad, FMT.n],
    ['N', 'TN PROG.', tot.tn_programadas, FMT.n], ['N', 'TN ACOPIO', tot.tn_acopio, FMT.n], ['N', 'TN DEVUELTAS', tot.tn_devueltas, FMT.n],
    ['Q', 'TN TOTAL', tot.tn_total_transportadas, FMT.n], ['Q', 'TN EN TRÁNSITO', tot.tn_transito, FMT.n], ['Q', 'VIAJES PENDIENTES', tot.viajes_pendientes, '0'],
  ];
  res.forEach(([col, l, v, f], i) => {
    const r = 1 + (i % 3) + 1;
    const lc = ws.getCell(`${col}${r}`), vc = ws.getCell(`${String.fromCharCode(col.charCodeAt(0) + 1)}${r}`);
    lc.value = l; lc.font = { bold: true, size: 9 }; vc.value = v ?? 0; vc.numFmt = f; vc.font = { size: 9 };
  });
  ws.getRow(6).values = COLS_DETALLE.map((c) => c[0]);
  cabecera(ws.getRow(6));
  COLS_DETALLE.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  filasDatos(ws, COLS_DETALLE, viajes, 1);
  const t = ws.addRow(['TOTAL', null, viajes.length, null, null, null, suma(viajes, 'peso_origen'), null, null, viajes.filter((v) => v.ticket).length,
    suma(viajes, 'peso_destino_calc'), suma(viajes, 'diferencia')]);
  t.font = { bold: true, size: 9 };
  [7, 11, 12].forEach((c) => { t.getCell(c).numFmt = FMT.n; });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + viajes.length, column: COLS_DETALLE.length } };
  return blob(wb);
}

/** Agrega al libro la hoja de un transportista con el formato "REPORTE DE SERVICIO TRANSPORTE". */
async function hojaTransportista(wb, op, t, viajes) {
  const nombre = String(t.nombre_comercial || 'TRANSPORTISTA').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 11 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getColumn(1).width = 2;
  COLS_TRANSP.forEach((c, i) => { ws.getColumn(i + 2).width = c[2]; });
  ws.getColumn(11).width = 3; ws.getColumn(12).width = 11; ws.getColumn(13).width = 30;
  const logo = await logoBase64();
  if (logo) ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: 1.1, row: 0.1 }, ext: { width: 110, height: 62 } });
  ws.getCell('D1').value = (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim();
  ws.getCell('D1').font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells('B4:J4');
  ws.getCell('B4').value = 'REPORTE DE SERVICIO TRANSPORTE';
  ws.getCell('B4').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  ws.getCell('B4').alignment = { horizontal: 'center' };
  ws.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  const info = [
    [5, 'VAPOR:', op.nave, 'CLIENTE:', op.cliente],
    [6, 'PRODUCTO:', op.producto, 'DAM:', op.dam],
    [7, 'FECHA INICIO:', op.fecha_inicio ? new Date(C.toMs(op.fecha_inicio)) : null, 'REFERENCIA:', op.referencia],
    [8, 'PUNTO SALIDA:', op.punto_salida, 'TOTAL VIAJES:', viajes.length],
    [9, 'PUNTO LLEGADA:', op.punto_llegada, 'TOTAL PESO TM HUACHO:', suma(viajes, 'peso_origen')],
    [10, 'EMPRESA DE TRANSPORTE:', t.razon_social, 'RUC', t.ruc],
  ];
  for (const [r, l1, v1, l2, v2] of info) {
    Object.assign(ws.getCell(`B${r}`), { value: l1 }); ws.getCell(`B${r}`).font = { bold: true, size: 9 };
    ws.getCell(`D${r}`).value = v1 ?? ''; ws.getCell(`D${r}`).font = { size: 9 };
    if (v1 instanceof Date) ws.getCell(`D${r}`).numFmt = /[ T]\d{2}:\d{2}/.test(String(op.fecha_inicio)) && !/[ T]00:00/.test(String(op.fecha_inicio)) ? 'dd/mm/yyyy hh:mm' : FMT.f;
    ws.getCell(`G${r}`).value = l2; ws.getCell(`G${r}`).font = { bold: true, size: 9 };
    ws.getCell(`H${r}`).value = v2 ?? ''; ws.getCell(`H${r}`).font = { size: 9 };
    if (typeof v2 === 'number' && r === 9) ws.getCell(`H${r}`).numFmt = FMT.n;
  }
  ws.getCell('I9').value = 'TOTAL PESO TM CSPCP:'; ws.getCell('I9').font = { bold: true, size: 9 };
  ws.getCell('J9').value = suma(viajes, 'peso_destino_calc'); ws.getCell('J9').numFmt = FMT.n;
  ws.getCell('I10').value = t.nombre_comercial; ws.getCell('I10').font = { bold: true, size: 9 };
  // Contacto (columna N-O como en el libro)
  const emails = String(t.emails || '').split(/[,;]\s*/).filter(Boolean);
  ws.getCell('L2').value = 'EMAIL:';
  emails.slice(0, 4).forEach((e, i) => { ws.getCell(`M${2 + i}`).value = e; });
  ws.getCell('L7').value = 'CONTACTO:'; ws.getCell('M7').value = t.contacto || '';
  ws.getCell('L8').value = 'TELEFONO:'; ws.getCell('M8').value = t.telefono || '';
  ['L2', 'L7', 'L8'].forEach((a) => { ws.getCell(a).font = { bold: true, size: 9 }; });

  ws.getRow(11).values = [null, ...COLS_TRANSP.map((c) => c[0])];
  cabecera(ws.getRow(11));
  const orden = [...viajes].sort((a, b) => a.nro - b.nro);
  filasDatos(ws, COLS_TRANSP, orden, 2);
  const tr = ws.addRow([null, 'Total', null, orden.length, null, null, null, suma(orden, 'peso_origen'), null, suma(orden, 'peso_destino_calc')]);
  tr.font = { bold: true, size: 9 };
  tr.getCell(8).numFmt = FMT.n; tr.getCell(10).numFmt = FMT.n;
  for (let c = 2; c <= 10; c++) tr.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  const f = tr.number + 2;
  ws.getCell(`B${f}`).value = '** CONFORMIDAD ACEPTADA **'; ws.getCell(`B${f}`).font = { bold: true };
  ws.getCell(`B${f + 1}`).value = 'FECHA:';
  ws.getCell(`B${f + 2}`).value = `APROBADO: ${(op.coordinador || '').toUpperCase()}`;
  ws.getCell(`H${f}`).value = op.coordinador || '';
  ws.getCell(`H${f + 1}`).value = 'Coordinador de Transporte';
  ws.getCell(`H${f + 2}`).value = (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim();
  ws.getCell(`H${f}`).border = { top: { style: 'thin' } };
  ws.getCell(`H${f}`).font = { bold: true };
  ws.pageSetup.printTitlesRow = '11:11';
}

export async function exportarTransportista(op, t, viajes) {
  const wb = new (XL().Workbook)();
  await hojaTransportista(wb, op, t, viajes);
  return blob(wb);
}

/** Un libro con una hoja por transportista (como el Excel original). */
export async function exportarTransportistas(op, grupos) {
  const wb = new (XL().Workbook)();
  for (const { t, viajes } of grupos) await hojaTransportista(wb, op, t, viajes);
  return blob(wb);
}

/** Lista de unidades / conductores de un transportista (columnas de la hoja LISTA). */
export const COLS_UNIDADES = [
  ['AP. PATERNO', 'ap_paterno', 16], ['AP. MATERNO', 'ap_materno', 16], ['1ER NOMBRE', 'nombre1', 14], ['2DO NOMBRE', 'nombre2', 14],
  ['DNI', 'dni', 11], ['BREVETE', 'brevete', 12], ['TRACTO', 'tracto', 10], ['PLATAFORMA', 'plataforma', 11],
];
export async function exportarUnidades(op, t, unidades) {
  const wb = new (XL().Workbook)();
  const ws = wb.addWorksheet('UNIDADES', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getColumn(1).width = 2;
  COLS_UNIDADES.forEach((c, i) => { ws.getColumn(i + 2).width = c[2]; });
  const logo = await logoBase64();
  if (logo) ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: 1.1, row: 0.1 }, ext: { width: 110, height: 62 } });
  ws.getCell('D1').value = (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim();
  ws.getCell('D1').font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.getCell('D2').value = `LISTA DE UNIDADES — ${op.nave} / ORDEN ${op.orden}`;
  ws.getCell('D2').font = { bold: true, size: 11 };
  ws.getCell('B5').value = 'EMPRESA DE TRANSPORTE:'; ws.getCell('B5').font = { bold: true, size: 9 };
  ws.getCell('D5').value = `${t.razon_social} · RUC ${t.ruc}`;
  ws.getRow(7).values = [null, ...COLS_UNIDADES.map((c) => c[0])];
  cabecera(ws.getRow(7));
  for (const u of unidades) {
    const row = ws.addRow([null, ...COLS_UNIDADES.map(([, k]) => u[k] ?? '')]);
    for (let c = 2; c <= COLS_UNIDADES.length + 1; c++) { row.getCell(c).border = borde; row.getCell(c).font = { size: 9 }; }
  }
  ws.addRow([null, `Total: ${unidades.length} unidades`]).font = { bold: true, size: 9 };
  return blob(wb);
}

/**
 * Libro "RESUMEN DE OPERACIONES ACOPIO DE SAL …": una hoja visible por nave con el cuadro de
 * transportistas. Las hojas ocultas (p. ej. RESUMEN) no se importan.
 */
/* ---------------- RESUMEN ANUAL ---------------- */
export const COLS_RESUMEN_T = [
  ['RAZON SOCIAL', 'razon_social', 36], ['RUC', 'ruc', 13], ['UNIDADES SOLICITADAS', 'unidades_solicitadas', 12, 'i'], ['TN PROM. X UNIDAD', 'tn_prom_unidad', 10, 'i'],
  ['VIAJES APROX.', 'viajes_aprox', 10, 'i'], ['TOTAL APROX. TN', 'tn_aprox', 11, 'i'], ['VIAJES REALIZADOS', 'viajes_realizados', 11, 'i'],
  ['TOTAL FINAL TN HUACHO', 'tn_huacho', 13, 'n'], ['TOTAL FINAL TN CSPCP', 'tn_cspcp', 13, 'n'], ['OBSERVACION', 'observacion', 26],
];
/** Libro como "RESUMEN DE OPERACIONES ACOPIO DE SAL … <AÑO>": hoja RESUMEN + una hoja por nave. */
export async function exportarResumenAnual(anio, ops, { soloTabla = false } = {}) {
  const wb = new (XL().Workbook)();
  // Hoja RESUMEN igual al libro: desde B4, columnas N° · NAVE · FECHA INICIO ACOPIO · FECHA FINAL ACOPIO · TN SAL ACOPIADA
  const ws = wb.addWorksheet('RESUMEN', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getColumn(1).width = 3; [6, 34, 20, 20, 18].forEach((w, i) => { ws.getColumn(i + 2).width = w; });
  ws.getCell('B2').value = `RESUMEN DE OPERACIONES ACOPIO DE SAL CHANCAY ${anio}`;
  ws.getCell('B2').font = { bold: true, size: 12, color: { argb: AZUL } };
  ws.getRow(4).values = [null, 'N°', 'NAVE', 'FECHA INICIO ACOPIO', 'FECHA FINAL ACOPIO', 'TN SAL ACOPIADA'];
  cabecera(ws.getRow(4));
  ops.forEach((o, i) => {
    const row = ws.addRow([null, i + 1, o.nave, o.resumen?.inicio_acopio ? new Date(C.toMs(o.resumen.inicio_acopio)) : null,
      o.resumen?.fin_acopio ? new Date(C.toMs(o.resumen.fin_acopio)) : null, o.tot.tn_acopio]);
    for (let c = 2; c <= 6; c++) { row.getCell(c).border = borde; row.getCell(c).font = { size: 10 }; }
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt = FMT.f; row.getCell(5).numFmt = FMT.f; row.getCell(6).numFmt = FMT.n;
  });
  const t = ws.addRow([null, null, 'TOTAL', null, null, rd(ops.reduce((s, o) => s + o.tot.tn_acopio, 0))]);
  t.font = { bold: true }; t.getCell(6).numFmt = FMT.n;
  for (let c = 2; c <= 6; c++) t.getCell(c).border = borde;
  if (soloTabla) return blob(wb);
  const usados = new Set([ws.name]);
  for (const o of ops) {
    let nombre = String(o.nave).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (usados.has(nombre)) nombre = `${nombre.slice(0, 28)} ${o.id}`.slice(0, 31);
    usados.add(nombre);
    const h = wb.addWorksheet(nombre, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    h.getColumn(1).width = 2; COLS_RESUMEN_T.forEach((c, i) => { h.getColumn(i + 2).width = c[2]; });
    h.getCell('B1').value = `${o.nave} · ORDEN ${o.orden}`; h.getCell('B1').font = { bold: true, size: 13, color: { argb: AZUL } };
    h.getCell('B2').value = `Acopio: ${o.resumen?.inicio_acopio ? C.fmtDT(C.toMs(o.resumen.inicio_acopio)).slice(0, 10) : '—'} al ${o.resumen?.fin_acopio ? C.fmtDT(C.toMs(o.resumen.fin_acopio)).slice(0, 10) : '—'} · TN acopiada ${o.tot.tn_acopio}`;
    h.getRow(4).values = [null, ...COLS_RESUMEN_T.map((c) => c[0])];
    cabecera(h.getRow(4));
    for (const r of o.filas) {
      const row = h.addRow([null, ...COLS_RESUMEN_T.map(([, k]) => r[k] ?? (k === 'observacion' ? '' : 0))]);
      COLS_RESUMEN_T.forEach(([, , , tp], i) => { const c = row.getCell(i + 2); c.border = borde; c.font = { size: 9 }; if (FMT[tp]) c.numFmt = FMT[tp]; });
    }
    const s = (k) => rd(o.filas.reduce((a, x) => a + (Number(x[k]) || 0), 0));
    const tr = h.addRow([null, 'TOTAL ', o.filas.filter((x) => x.ruc).length, s('unidades_solicitadas'), '-', s('viajes_aprox'), s('tn_aprox'), s('viajes_realizados'), s('tn_huacho'), s('tn_cspcp')]);
    tr.font = { bold: true, size: 9 }; tr.getCell(9).numFmt = FMT.n; tr.getCell(10).numFmt = FMT.n;
  }
  return blob(wb);
}

/* ---------------- REPORTES de avance por cortes (PROCESO DE DESPACHO / ACOPIO) ---------------- */
const horasTxt = (h) => (h == null ? '' : `${Math.floor(Math.round(h * 60) / 60)}:${String(Math.round(h * 60) % 60).padStart(2, '0')}`);
export const FILAS_CORTE = [
  ['INICIO', (r) => r.inicio, 'dt'], ['CIERRE', (r) => r.fin, 'dt'], ['TN PARCIAL', (r) => r.tn_parcial, 'n'], ['# VIAJES', (r) => r.viajes, 'i'],
  ['# HORAS', (r) => horasTxt(r.horas)], ['Ø TN X UNID.', (r) => r.tn_x_unidad, 'n'], ['Ø UNID. X HR', (r) => r.unid_x_hora, 'n'],
  ['TN TOTAL', (r) => r.tn_total, 'n'], ['VIAJES TOTAL', (r) => r.viajes_total, 'i'], ['HRS. TOTAL', (r) => horasTxt(r.horas_total)],
  ['TN RESTANTES', (r) => r.tn_restantes, 'n'], ['VIAJES EST. REST.', (r) => r.viajes_est_rest, 'i'], ['HRS. EST. REST.', (r) => horasTxt(r.horas_est_rest)],
  ['FCH. EST. TERM.', (r) => r.fecha_est_termino, 'dt'],
];
export async function exportarCortes(op, proceso, cortes, ordinal) {
  const wb = new (XL().Workbook)();
  const P = proceso === 'despacho' ? 'DESPACHO' : 'ACOPIO';
  const ws = wb.addWorksheet(`PROCESO DE ${P}`, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getColumn(1).width = 2; ws.getColumn(2).width = 20;
  cortes.forEach((_, i) => { ws.getColumn(i + 3).width = 18; });
  const logo = await logoBase64();
  if (logo) ws.addImage(wb.addImage({ base64: logo, extension: 'png' }), { tl: { col: 1.1, row: 0.1 }, ext: { width: 90, height: 50 } });
  ws.getCell('C1').value = (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim(); ws.getCell('C1').font = { bold: true, size: 13, color: { argb: AZUL } };
  ws.getCell('C2').value = `PROCESO DE ${P} — ${op.nave} / ORDEN ${op.orden}`; ws.getCell('C2').font = { bold: true, size: 11 };
  const h = ws.getRow(4);
  h.values = [null, `PROCESO DE ${P}`, ...cortes.map((r) => `${ordinal(r.numero)} REPORTE ${P}`)];
  cabecera(h);
  for (const [l, f, t] of FILAS_CORTE) {
    const row = ws.addRow([null, l, ...cortes.map((r) => { const v = f(r); if (v == null || v === '') return null; return t === 'dt' ? new Date(C.toMs(v)) : v; })]);
    row.getCell(2).font = { bold: true, size: 9 }; row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
    for (let c = 2; c <= cortes.length + 2; c++) { const cell = row.getCell(c); cell.border = borde; if (c > 2) { cell.alignment = { horizontal: 'center' }; cell.font = { size: 9, bold: ['TN PARCIAL', 'TN TOTAL', 'TN RESTANTES', 'FCH. EST. TERM.'].includes(l) }; if (FMT[t]) cell.numFmt = t === 'dt' ? 'dd/mm/yyyy hh:mm' : FMT[t]; } }
  }
  return blob(wb);
}
