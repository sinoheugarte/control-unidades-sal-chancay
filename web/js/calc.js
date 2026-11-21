/**
 * Lógica de cálculo replicada del libro "REPORTE DE CONTROL UNIDADES SAL".
 * Todas las fechas-hora se guardan como texto local "YYYY-MM-DD HH:MM[:SS]"
 * (hora de Perú, sin horario de verano) y se operan como UTC "ingenuo".
 */

const JORNADAS = ['07:00 - 16:00', '16:00 - 23:00', '23:00 - 07:00'];
const RANGOS = ['<=30 MIN', '>30 MIN - <1 HR', '>=1 HR'];
const STATUS = { PENDIENTE: 'FALTA DESCARGAR', DESCARGADO: 'DESCARGADO', DEVUELTO: 'TN DEVUELTAS' };

const r3 = (n) => Math.round(n * 1000) / 1000;
const roundUp = (n, d = 0) => { const f = 10 ** d; return Math.ceil(r3(n * f)) / f; };

function normPlaca(v) {
  return String(v ?? '').trim().replace(/[-\s]/g, '').toUpperCase();
}

/** "2026-10-20 18:02:36" | "2026-10-20T18:02" | Date -> ms (UTC ingenuo) */
function toMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.getTime();
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function fmtDT(ms, withSeconds = false) {
  if (ms === null || ms === undefined) return null;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return withSeconds ? `${s}:${p(d.getUTCSeconds())}` : s;
}

/** Normaliza cualquier entrada de fecha-hora al formato de almacenamiento. */
function normDT(v, withSeconds = true) {
  const ms = toMs(v);
  return ms === null ? null : fmtDT(ms, withSeconds);
}
function normDate(v) {
  const ms = toMs(v);
  return ms === null ? null : fmtDT(ms).slice(0, 10);
}

/** Jornada (turno) según la hora del día. */
function jornadaDe(v) {
  const ms = toMs(v);
  if (ms === null) return null;
  const h = new Date(ms).getUTCHours();
  if (h >= 7 && h < 16) return JORNADAS[0];
  if (h >= 16 && h < 23) return JORNADAS[1];
  return JORNADAS[2];
}

/**
 * Turno operativo de una fecha-hora: el turno 23:00 - 07:00 que empieza a las 23:00
 * se reporta en el día siguiente (regla observada en el Excel).
 */
function turnoDe(v) {
  const ms = toMs(v);
  if (ms === null) return { fecha: null, jornada: null };
  const h = new Date(ms).getUTCHours();
  const fecha = fmtDT(h >= 23 ? ms + 86400000 : ms).slice(0, 10);
  return { fecha, jornada: jornadaDe(v) };
}

function rangoDe(min) {
  if (min === null || min === undefined) return null;
  if (min >= 60) return RANGOS[2];
  if (min > 30) return RANGOS[1];
  return RANGOS[0];
}

function enVentana(ms, reps) {
  if (ms === null) return null;
  // Si las ventanas se solapan (pasa en el Excel original), gana la de número mayor que empezó antes.
  let best = null;
  for (const r of reps) {
    const a = toMs(r.inicio), b = toMs(r.fin);
    if (a === null) continue;
    if (ms >= a && (b === null || ms < b)) best = r.numero;
  }
  return best;
}

/**
 * Enriquecer viajes con las columnas calculadas de DETALLE TRANSPORTE.
 * @param viajes filas de la tabla viajes (con transportista_nombre)
 * @param op operación
 * @param reportes ventanas (despacho / acopio)
 */
function enriquecerViajes(viajes, op, reportes = []) {
  const repD = reportes.filter((r) => r.tipo === 'despacho');
  const repA = reportes.filter((r) => r.tipo === 'acopio');
  // Igual que el Excel: el N° de viaje y la vuelta siguen el orden de registro (orden de filas del reporte de planta).
  const ordenados = [...viajes].sort((a, b) => a.id - b.id);
  const vueltas = new Map();
  let acum = 0;
  const prog = op.tn_programadas || 0;
  return ordenados.map((v, i) => {
    const placa = normPlaca(v.placa);
    const vuelta = (vueltas.get(placa) || 0) + 1;
    vueltas.set(placa, vuelta);
    const tieneTicket = v.ticket !== null && v.ticket !== undefined && String(v.ticket).trim() !== '';
    const devuelto = tieneTicket && String(v.ticket).trim() === '-';
    const status = !tieneTicket ? STATUS.PENDIENTE : devuelto ? STATUS.DEVUELTO : STATUS.DESCARGADO;
    const tipo = devuelto ? 'TN DEVUELTAS' : 'ACOPIO';
    // Igual que el Excel: sin ticket, el peso de destino se asume igual al de origen.
    const pesoDestinoCalc = tieneTicket ? (v.peso_destino ?? 0) : (v.peso_origen ?? 0);
    const redondeo = devuelto && pesoDestinoCalc < 30 ? 30 : pesoDestinoCalc;
    const diferencia = tieneTicket && !devuelto && v.peso_origen != null && v.peso_destino != null
      ? r3(v.peso_destino - v.peso_origen) : null;
    acum = r3(acum + pesoDestinoCalc);
    const ini = toMs(v.ingreso_en), fin = toMs(v.salida_en);
    const tiempoMin = ini !== null && fin !== null ? Math.round((fin - ini) / 60000) : null;
    return {
      ...v,
      placa,
      nro: i + 1,
      vuelta,
      tipo,
      status,
      peso_destino_calc: r3(pesoDestinoCalc),
      redondeo: r3(redondeo),
      diferencia,
      acumulado: acum,
      restante: Math.max(0, r3(prog - acum)),
      tiempo_min: tiempoMin,
      rango: rangoDe(tiempoMin),
      rep_despacho_calc: v.rep_despacho ?? enVentana(toMs(v.despacho_en), repD),
      rep_acopio_calc: v.rep_acopio ?? enVentana(toMs(v.ingreso_en), repA),
    };
  });
}

/** Totales de cabecera (DETALLE TRANSPORTE!S1:S4 y RESUMEN ACOPIO). */
function totales(vs, op, embarque) {
  const sum = (arr, f) => r3(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));
  const desc = vs.filter((v) => v.status === STATUS.DESCARGADO);
  const pend = vs.filter((v) => v.status === STATUS.PENDIENTE);
  const dev = vs.filter((v) => v.status === STATUS.DEVUELTO);
  const prog = op.tn_programadas || 0;
  const tnDespacho = sum(vs.filter((v) => v.tipo === 'ACOPIO'), (v) => v.peso_origen);
  const tnAcopio = sum(desc, (v) => v.peso_destino);
  const tnTransito = sum(pend, (v) => v.peso_origen);
  const tnDevueltas = sum(dev, (v) => v.peso_destino_calc);
  const tnEmbarque = embarque?.tn_embarcadas ?? null;
  const tiempos = vs.filter((v) => v.tiempo_min !== null).map((v) => v.tiempo_min);
  return {
    tn_programadas: prog,
    viajes: vs.length,
    viajes_descargados: desc.length,
    viajes_pendientes: pend.length,
    viajes_devueltos: dev.length,
    unidades_activas: new Set(vs.map((v) => v.placa)).size,
    tn_despacho: tnDespacho,
    tn_acopio: tnAcopio,
    tn_transito: tnTransito,
    tn_devueltas: tnDevueltas,
    tn_total_transportadas: r3(tnAcopio + tnDevueltas),
    pct_despacho: prog ? Math.min(1, tnDespacho / prog) : 0,
    pct_acopio: prog ? Math.min(1, tnAcopio / prog) : 0,
    tn_rest_despacho: r3(prog - tnDespacho),
    tn_rest_acopio: r3(prog - tnAcopio),
    peso_prom_unidad: desc.length ? r3(tnAcopio / desc.length) : 0,
    diferencia_acopio_despacho: r3(sum(desc, (v) => v.peso_destino) - sum(desc, (v) => v.peso_origen)),
    tiempo_prom_min: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
    tn_embarque: tnEmbarque,
    dif_embarque_acopio: tnEmbarque !== null ? r3(tnEmbarque - tnAcopio) : null,
    tn_draft_sgs: op.tn_draft_sgs ?? null,
    dif_draft_embarque: op.tn_draft_sgs != null && tnEmbarque !== null ? r3(op.tn_draft_sgs - tnEmbarque) : null,
  };
}

/**
 * Tabla de reportes por turno (hoja REPORTES).
 * tipo 'despacho' usa peso de origen; 'acopio' usa peso de destino (descargados).
 */
function tablaReportes(vs, op, reportes, tipo) {
  const prog = op.tn_programadas || 0;
  const reps = reportes.filter((r) => r.tipo === tipo).sort((a, b) => a.numero - b.numero);
  const key = tipo === 'despacho' ? 'rep_despacho_calc' : 'rep_acopio_calc';
  const peso = (v) => (tipo === 'despacho' ? v.peso_origen : v.status === STATUS.PENDIENTE ? 0 : v.peso_destino_calc) || 0;
  let tnTot = 0, viajesTot = 0, hrsTot = 0;
  return reps.map((r) => {
    const sel = vs.filter((v) => v[key] === r.numero && (tipo === 'despacho' || v.status !== STATUS.PENDIENTE));
    const tn = r3(sel.reduce((s, v) => s + peso(v), 0));
    const viajes = sel.length;
    const a = toMs(r.inicio), b = toMs(r.fin);
    const horas = a !== null && b !== null ? (b - a) / 3600000 : null;
    if (horas !== null) { tnTot = r3(tnTot + tn); viajesTot += viajes; hrsTot += horas; }
    const rest = horas !== null ? Math.max(0, r3(prog - tnTot)) : null;
    const hrsEst = rest !== null && tn > 0 ? (rest <= 0 ? 0 : roundUp((rest * horas) / tn)) : null;
    return {
      ...r,
      tn_parcial: tn,
      viajes,
      horas,
      tn_x_unidad: viajes ? r3(tn / viajes) : null,
      unid_x_hora: horas ? Math.round((viajes / horas) * 100) / 100 : null,
      tn_total: horas !== null ? tnTot : null,
      viajes_total: horas !== null ? viajesTot : null,
      horas_total: horas !== null ? hrsTot : null,
      tn_restantes: rest,
      viajes_est_rest: rest !== null && tnTot > 0 ? (rest <= 0 ? 0 : roundUp((rest * viajesTot) / tnTot)) : null,
      horas_est_rest: hrsEst,
      fecha_est_termino: hrsEst !== null && b !== null ? fmtDT(b + hrsEst * 3600000) : null,
    };
  });
}

/** Proceso de embarque (RESUMEN EMBARQUE). Los reportes llevan TN acumulada tipeada. */
function tablaEmbarque(op, reportes, etapas) {
  const prog = op.tn_embarque_programadas || op.tn_programadas || 0;
  const reps = reportes.filter((r) => r.tipo === 'embarque').sort((a, b) => a.numero - b.numero);
  let prevAcum = 0, hrsTot = 0;
  const filas = reps.map((r) => {
    const a = toMs(r.inicio), b = toMs(r.fin);
    const horas = a !== null && b !== null ? (b - a) / 3600000 : null;
    const acum = r.tn_acumulado;
    const parcial = acum != null ? r3(acum - prevAcum) : null;
    if (acum != null) prevAcum = acum;
    if (horas !== null) hrsTot += horas;
    const rest = acum != null ? r3(prog - acum) : null;
    const hrsEst = rest !== null && parcial > 0 && horas ? (rest <= 0 ? 0 : Math.round((rest * horas) / parcial)) : null;
    return {
      ...r,
      tn_parcial: parcial,
      horas,
      tn_x_hora: parcial !== null && horas ? r3(parcial / horas) : null,
      tn_total: acum,
      horas_total: horas !== null ? hrsTot : null,
      tn_restantes: rest,
      horas_est_rest: hrsEst,
      fecha_est_termino: hrsEst !== null && b !== null ? fmtDT(b + hrsEst * 3600000) : null,
    };
  });
  const tnEmb = reps.reduce((m, r) => (r.tn_acumulado != null && r.tn_acumulado > m ? r.tn_acumulado : m), 0);
  const etapasCalc = etapas.map((e) => {
    const a = toMs(e.inicio), b = toMs(e.fin);
    return { ...e, horas: a !== null && b !== null ? (b - a) / 3600000 : null };
  });
  return {
    tn_programadas: prog,
    tn_embarcadas: reps.length ? tnEmb : null,
    tn_restantes: r3(prog - tnEmb),
    tn_draft_sgs: op.tn_draft_sgs ?? null,
    reportes: filas,
    etapas: etapasCalc,
    horas_etapas: etapasCalc.reduce((s, e) => s + (e.horas || 0), 0),
  };
}

export const N_VUELTAS = 15;
export const NOMBRES_VUELTA = ['1 ERA', '2 DA', '3 ERA', '4 TA', '5 TA', '6 TA', '7 MA', '8 VA', '9 NA', '10 NA', '11 NA', '12 NA', '13 NA', '14 NA', '15 NA'].map((x) => `${x} VUELTA`);

/**
 * Planificación por vueltas (hoja TRANSPORTISTAS, columnas P:AE):
 *  1ª vuelta = unidades solicitadas × TN prom. por unidad; vueltas 2-10 = 1ª vuelta × n;
 *  vueltas 11-15 (y cualquier otra) se pueden escribir a mano. TOTAL TN = MAX de las vueltas.
 */
function vueltasPlan(p) {
  const base = r3((p.unidades_solicitadas || 0) * (p.tn_prom_unidad || 0));
  const man = p.vueltas_manual || {};
  const vueltas = Array.from({ length: N_VUELTAS }, (_, i) => {
    const m = man[i + 1];
    if (m !== undefined && m !== null && m !== '') return { tn: Number(m), manual: true };
    return i < 10 ? { tn: r3(base * (i + 1)), manual: false } : { tn: null, manual: false };
  });
  const total = Math.max(0, ...vueltas.map((v) => v.tn || 0), p.tn_asignadas || 0);
  return { vueltas, total: r3(total) };
}

/**
 * Vueltas hasta completar las TN programadas de la operación, repartidas entre los transportistas:
 *  - Capacidad por vuelta de cada empresa = unidades solicitadas × TN prom. por unidad.
 *  - Se completan las vueltas que caben en las TN programadas (cada vuelta suma la capacidad de todas).
 *  - Última vuelta: de más a menos unidades, quien cabe completo en lo que falta suma su vuelta entera;
 *    el saldo lo completa el de más unidades entre los que no cupieron (así el total es exacto).
 *  - Cada columna de vuelta es acumulada (como en el Excel) y TOTAL TN = valor de la última vuelta.
 * Las empresas con vueltas escritas a mano conservan sus valores y se descuentan de lo programado.
 * Devuelve Map(transportista_id → { vueltas, total, viajes }).
 */
function planVueltas(participantes, tnProgramadas) {
  const out = new Map();
  const auto = [];
  let prog = Number(tnProgramadas) || 0;
  for (const p of participantes) {
    if (Object.keys(p.vueltas_manual || {}).length || !prog) {
      const pl = vueltasPlan(p);
      out.set(p.transportista_id, { ...pl, viajes: p.tn_prom_unidad ? Math.ceil(pl.total / p.tn_prom_unidad) : 0 });
      if (prog && Object.keys(p.vueltas_manual || {}).length) prog -= pl.total;
    } else auto.push(p);
  }
  const cap = (p) => r3((p.unidades_solicitadas || 0) * (p.tn_prom_unidad || 0));
  const C = auto.reduce((s, p) => s + cap(p), 0);
  const vacio = () => ({ vueltas: Array.from({ length: N_VUELTAS }, () => ({ tn: null, manual: false })), total: 0, viajes: 0 });
  if (C <= 0 || prog <= 0) { auto.forEach((p) => out.set(p.transportista_id, vacio())); return out; }
  let k = Math.floor((prog + 1e-9) / C);
  let R = r3(prog - k * C);
  if (R < 0.0005) R = 0;
  // Última vuelta (lógica del Excel): de más a menos unidades, cada transportista que cabe completo en lo que
  // falta suma su vuelta entera; el saldo lo completa el de más unidades entre los que no cupieron.
  const ult = new Map(auto.map((p) => [p.transportista_id, { tn: 0 }]));
  if (R > 0) {
    const orden = auto.filter((p) => cap(p) > 0)
      .sort((a, b) => (b.unidades_solicitadas || 0) - (a.unidades_solicitadas || 0) || cap(b) - cap(a));
    let falta = R, saldo = null;
    for (const p of orden) {
      if (cap(p) <= falta + 1e-9) { ult.get(p.transportista_id).tn = cap(p); falta = r3(falta - cap(p)); }
      else if (!saldo) saldo = p;
    }
    if (falta > 0) ult.get((saldo || orden[0]).transportista_id).tn = r3(ult.get((saldo || orden[0]).transportista_id).tn + falta);
  }
  const nV = k + (R > 0 ? 1 : 0);
  for (const p of auto) {
    const c = cap(p), u = ult.get(p.transportista_id);
    const final = r3(c * k + u.tn);
    const vueltas = Array.from({ length: N_VUELTAS }, (_, i) => {
      const n = i + 1;
      if (n > nV || !c) return { tn: null, manual: false };
      if (n === N_VUELTAS && nV > N_VUELTAS) return { tn: final, manual: false }; // más de 15 vueltas: la 15ª lleva el total
      return { tn: n <= k ? r3(c * n) : final, manual: false };
    });
    out.set(p.transportista_id, { vueltas, total: final, viajes: p.tn_prom_unidad ? Math.ceil(final / p.tn_prom_unidad - 1e-9) : 0 });
  }
  return out;
}

/** Resumen por transportista (hoja TRANSPORTISTAS). tnProgramadas: TN programadas de la operación. */
function resumenTransportistas(vs, participantes, unidades, tnProgramadas = 0) {
  const planes = planVueltas(participantes, tnProgramadas);
  return participantes.map((p) => {
    const mios = vs.filter((v) => v.transportista_id === p.transportista_id);
    const plan = planes.get(p.transportista_id);
    const tnAprox = plan.total;
    const vueltasMax = mios.reduce((m, v) => Math.max(m, v.vuelta), 0);
    return {
      ...p,
      unidades_en_lista: unidades.filter((u) => u.transportista_id === p.transportista_id).length,
      tn_aprox: r3(tnAprox),
      vueltas: plan.vueltas,
      viajes_aprox: plan.viajes,
      unidades_activas: new Set(mios.map((v) => v.placa)).size,
      viajes_realizados: mios.length,
      viajes_pendientes: mios.filter((v) => v.status === STATUS.PENDIENTE).length,
      tn_despacho: r3(mios.reduce((s, v) => s + (v.peso_origen || 0), 0)),
      tn_final: r3(mios.reduce((s, v) => s + (v.redondeo || 0), 0)),
      vueltas_max: vueltasMax,
      avance: tnAprox ? Math.min(1, mios.reduce((s, v) => s + (v.redondeo || 0), 0) / tnAprox) : null,
      observacion_calc: mios.length === 0 ? 'NO PARTICIPO'
        : mios.some((v) => v.status === STATUS.DEVUELTO) ? 'VIAJES DE SAL DEVUELTOS' : '',
    };
  });
}

/**
 * Resumen compacto de una operación para el RESUMEN ANUAL (como el libro
 * "RESUMEN DE OPERACIONES ACOPIO DE SAL"): fechas y TN de acopio, y el cuadro por transportista.
 */
function resumenOperacion(vs, op, participantes, unidades) {
  const desc = vs.filter((v) => v.status === STATUS.DESCARGADO);
  const fechasAcopio = desc.map((v) => (v.ingreso_en || v.fecha_recepcion || '').slice(0, 10)).filter(Boolean).sort();
  const fechasDesp = vs.map((v) => v.fecha_despacho).filter(Boolean).sort();
  const rt = resumenTransportistas(vs, participantes, unidades, op?.tn_programadas);
  return {
    viajes: vs.length,
    unidades: new Set(vs.map((v) => v.placa)).size,
    tn_despacho: r3(vs.reduce((s, v) => s + (v.peso_origen || 0), 0)),
    tn_acopio: r3(desc.reduce((s, v) => s + (v.peso_destino || 0), 0)),
    inicio_acopio: fechasAcopio[0] || fechasDesp[0] || null,
    fin_acopio: fechasAcopio[fechasAcopio.length - 1] || fechasDesp[fechasDesp.length - 1] || null,
    transportistas: rt.map((t) => ({
      razon_social: t.razon_social, ruc: t.ruc, nombre_comercial: t.nombre_comercial,
      unidades_solicitadas: t.unidades_solicitadas || 0, unidades_en_lista: t.unidades_en_lista, tn_prom_unidad: t.tn_prom_unidad,
      viajes_aprox: t.viajes_aprox, tn_aprox: t.tn_aprox, unidades_activas: t.unidades_activas, viajes_realizados: t.viajes_realizados,
      tn_huacho: t.tn_despacho, tn_cspcp: t.tn_final, observacion: t.observacion || t.observacion_calc || '',
    })),
  };
}

/** Año al que pertenece una operación (para el resumen anual). */
function anioOperacion(o) {
  return Number(o.anio || String(o.resumen?.inicio_acopio || o.fecha_inicio || o.eta || '').slice(0, 4)) || null;
}

/** Resumen operativo por día y jornada (hoja RESUMEN 2). */
function resumenJornadas(vs) {
  const agrupar = (lista, fFecha, fJornada, fPeso) => {
    const m = new Map();
    for (const v of lista) {
      const f = fFecha(v); if (!f) continue;
      const k = `${f}|${fJornada(v) || '-'}`;
      const o = m.get(k) || { fecha: f, jornada: fJornada(v) || '-', viajes: 0, tn: 0 };
      o.viajes++; o.tn = r3(o.tn + (fPeso(v) || 0));
      m.set(k, o);
    }
    const ordJ = (j) => { const i = JORNADAS.indexOf(j); return i === 2 ? -1 : i; }; // 23-07 abre el día
    return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || ordJ(a.jornada) - ordJ(b.jornada));
  };
  return {
    despacho: agrupar(vs, (v) => v.fecha_despacho, (v) => v.jornada_despacho, (v) => v.peso_origen),
    acopio: agrupar(vs.filter((v) => v.status !== STATUS.PENDIENTE), (v) => v.fecha_recepcion, (v) => v.jornada_recepcion, (v) => v.peso_destino_calc),
  };
}

/**
 * Hoja RESUMEN 3 (dos tablas dinámicas sobre DETALLE TRANSPORTE):
 *  - TablaDinámica3: TRANSPORTE → PLACA con CONTEO (correlativo dentro de cada empresa) y # VIAJES;
 *    empresas y placas ordenadas de mayor a menor # de viajes. Total general y UNIDADES ACTIVAS.
 *  - TablaDinámica2: # VUELTAS (de la mayor a la 1) → CANT. UNIDADES = cuántas unidades llegaron a esa
 *    vuelta (cuenta de filas con esa vuelta). La suma es el total de viajes.
 */
function resumenUnidades(vs) {
  const m = new Map();
  for (const v of vs) {
    const o = m.get(v.placa) || { placa: v.placa, transportista: v.transportista_nombre || 'SIN TRANSPORTISTA', viajes: 0, tn: 0 };
    o.viajes++; o.tn = r3(o.tn + (v.peso_destino_calc || 0));
    if (!o.transportista || o.transportista === 'SIN TRANSPORTISTA') o.transportista = v.transportista_nombre || o.transportista;
    m.set(v.placa, o);
  }
  const unidades = [...m.values()].sort((a, b) => b.viajes - a.viajes || a.placa.localeCompare(b.placa));
  const g = new Map();
  for (const u of unidades) {
    const x = g.get(u.transportista) || { transportista: u.transportista, viajes: 0, tn: 0, unidades: [] };
    x.viajes += u.viajes; x.tn = r3(x.tn + u.tn);
    x.unidades.push({ ...u, conteo: x.unidades.length + 1 });
    g.set(u.transportista, x);
  }
  const grupos = [...g.values()].sort((a, b) => b.viajes - a.viajes || a.transportista.localeCompare(b.transportista));
  const porVuelta = new Map();
  for (const v of vs) { const n = v.vuelta || 1; porVuelta.set(n, (porVuelta.get(n) || 0) + 1); }
  const max = Math.max(0, ...porVuelta.keys());
  const distribucion = [];
  for (let n = max; n >= 1; n--) distribucion.push({ vueltas: n, cantidad: porVuelta.get(n) || 0 });
  return { unidades, grupos, distribucion, total_viajes: vs.length, unidades_activas: unidades.length };
}

/** Tiempo de atención en puerto por día (RESUMEN ACOPIO, Q21). */
function resumenTiempos(vs) {
  const m = new Map();
  for (const v of vs) {
    if (!v.rango) continue;
    const dia = (v.ingreso_en || v.fecha_recepcion || '').slice(0, 10);
    const o = m.get(dia) || { dia, [RANGOS[0]]: 0, [RANGOS[1]]: 0, [RANGOS[2]]: 0, total: 0 };
    o[v.rango]++; o.total++;
    m.set(dia, o);
  }
  return [...m.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Planificación previa (hoja PREACOPIO). */
function preacopio(op) {
  let p = {};
  try { p = typeof op.params === 'string' ? JSON.parse(op.params || '{}') : (op.params || {}); } catch { p = {}; }
  const tn = op.tn_programadas || 0;
  const tnUnidad = Number(p.tn_x_unidad) || 36;
  const vph = Number(p.viajes_x_hora) || 8;
  const jxd = Number(p.jornadas_x_dia) || 3;
  const tph = Number(p.tn_x_hora_embarque) || 1166;
  const viajesTotal = Math.ceil(tn / tnUnidad);
  const hrsAcopio = roundUp(viajesTotal / vph, 2);
  const hrsEmb = roundUp(tn / tph, 2);
  const roundTrip = Array.isArray(p.round_trip) && p.round_trip.length ? p.round_trip : [
    { etapa: 'Ingreso a Puerto', min: 4 }, { etapa: 'Descarga', min: 3 }, { etapa: 'Salida de Puerto', min: 4 },
    { etapa: 'Viaje a Otuma', min: 70 }, { etapa: 'Ingreso a Otuma', min: 5 }, { etapa: 'Carga en Otuma', min: 10 },
    { etapa: 'Salida Otuma', min: 10 }, { etapa: 'Viaje a Puerto', min: 70 }, { etapa: 'Ingreso a Puerto', min: 4 },
  ];
  const rtMin = roundTrip.reduce((s, x) => s + (Number(x.min) || 0), 0);
  const unidMin = Math.ceil((rtMin / 60) * vph);
  const ini = toMs(p.inicio_acopio), iniE = toMs(p.inicio_embarque);
  return {
    tn_total: tn, tn_x_unidad: tnUnidad, viajes_x_hora: vph, jornadas_x_dia: jxd, tn_x_hora_embarque: tph,
    acopio: {
      viajes_total: viajesTotal, horas: hrsAcopio, dias: r3(hrsAcopio / 24),
      jornadas_total: Math.ceil(r3((hrsAcopio / 24) * jxd)),
      inicio: p.inicio_acopio || null, termino: ini !== null ? fmtDT(ini + hrsAcopio * 3600000) : null,
    },
    embarque: {
      horas: hrsEmb, dias: r3(hrsEmb / 24), jornadas_total: Math.ceil(r3((hrsEmb / 24) * jxd)),
      inicio: p.inicio_embarque || null, termino: iniE !== null ? fmtDT(iniE + hrsEmb * 3600000) : null,
    },
    round_trip: roundTrip, round_trip_min: rtMin,
    unidades_min: unidMin, unidades_necesarias: Math.ceil(unidMin * 1.5),
  };
}

export {
  JORNADAS, RANGOS, STATUS,
  normPlaca, toMs, fmtDT, normDT, normDate, jornadaDe, turnoDe, rangoDe, r3,
  enriquecerViajes, totales, tablaReportes, tablaEmbarque,
  resumenTransportistas, vueltasPlan, planVueltas, resumenOperacion, anioOperacion, resumenJornadas, resumenUnidades, resumenTiempos, preacopio,
};
