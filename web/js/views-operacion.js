import {
  state, api, esc, num, pct, fecha, fechaHora, minutos, toInputDT, ahoraInput, hoyInput, normPlaca,
  statusPill, rangoPill, toast, $, modal, confirmar, tabla, sinOperacion, puedeEscribir, esAdmin, chart, colores, descargar, fichas,
} from './core.js?v=__V__';
import { turnoDe } from './calc.js?v=__V__';

/* =================== TABLERO =================== */
export async function vTablero(view) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const d = await api(`/operaciones/${state.opId}/tablero`);
  const { operacion: op, totales: t, embarque: e } = d;
  const kpi = (l, v, s = '', barra) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}
    ${barra !== undefined ? `<div class="bar ${barra >= 1 ? 'ok' : ''}"><i style="width:${Math.min(100, barra * 100)}%"></i></div>` : ''}</div>`;
  view.innerHTML = `
    <div class="card"><div class="card-h"><div><h2>${esc(op.nave)} · Orden ${esc(op.orden)}</h2>
      <div class="muted small">${esc(op.cliente || '')} · ${esc(op.producto || '')} · ${esc(op.punto_salida || '')} → ${esc(op.punto_llegada || '')}
      · ETA ${fechaHora(op.eta)} · DAM ${esc(op.dam || '—')}</div></div>
      <div class="btns no-print"><span class="pill ${op.estado === 'FINALIZADA' ? 'ok' : 'info'}">${esc(op.estado)}</span>
      <button class="btn sm" id="b-print">Imprimir</button>
      <button class="btn sm" id="b-xls">Exportar detalle</button>
      ${puedeEscribir() ? `<button class="btn sm ${op.estado === 'FINALIZADA' ? '' : 'primary'}" id="b-fin">${op.estado === 'FINALIZADA' ? 'Regenerar presentación / reenviar' : 'Finalizar operación'}</button>` : ''}
      ${op.estado === 'FINALIZADA' && esAdmin() ? '<button class="btn sm" id="b-reabrir">Reabrir</button>' : ''}</div></div>
      ${op.estado === 'FINALIZADA' ? `<div class="alert ok" style="margin-top:6px">Finalizada ${op.finalizada_en ? `el ${fechaHora(op.finalizada_en)}` : ''}${op.finalizada_por ? ` por ${esc(op.finalizada_por)}` : ''}.
        ${op.presentacion ? `Presentación: ${[['pptx', 'PowerPoint'], ['html', 'HTML'], ['video', 'Video']].filter(([k]) => op.presentacion[k]).map(([k, l]) => `<a href="${esc(op.presentacion[k])}" target="_blank" rel="noopener">${l}</a>`).join(' · ')}` : ''}
        ${op.ultimo_correo ? `<div class="small" style="margin-top:4px">Último correo: ${fechaHora(op.ultimo_correo.en)} · ${op.ultimo_correo.ok ? `enviado a ${esc(op.ultimo_correo.para.join(', '))}` : `no enviado (${esc(op.ultimo_correo.error || '')})`}</div>` : ''}</div>` : ''}
    </div>
    <div class="kpis">
      ${kpi('TN programadas', num(t.tn_programadas), `${num(d.preacopio.acopio.viajes_total, 0)} viajes estimados`)}
      ${kpi('TN despachadas', num(t.tn_despacho), `${pct(t.pct_despacho)} · restan ${num(Math.max(0, t.tn_rest_despacho))}`, t.pct_despacho)}
      ${kpi('TN acopiadas (puerto)', num(t.tn_acopio), `${pct(t.pct_acopio)} · restan ${num(Math.max(0, t.tn_rest_acopio))}`, t.pct_acopio)}
      ${kpi('En tránsito', num(t.tn_transito), `${t.viajes_pendientes} viajes por descargar`)}
      ${kpi('Viajes', num(t.viajes, 0), `${t.viajes_descargados} descargados · ${t.viajes_devueltos} devueltos`)}
      ${kpi('Unidades activas', num(t.unidades_activas, 0), `${d.unidades_en_lista} en lista · mín. requerido ${d.preacopio.unidades_necesarias}`)}
      ${kpi('Prom. TN / unidad', num(t.peso_prom_unidad), `Dif. puerto − planta: ${num(t.diferencia_acopio_despacho)} TN`)}
      ${kpi('Atención en puerto', minutos(t.tiempo_prom_min), 'tiempo promedio (h:mm)')}
      ${kpi('TN embarcadas', num(t.tn_embarque), e.tn_programadas ? `${pct((t.tn_embarque || 0) / e.tn_programadas)} de ${num(e.tn_programadas)}` : '', e.tn_programadas ? (t.tn_embarque || 0) / e.tn_programadas : undefined)}
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>Avance acumulado por reporte</h3><span class="muted small">TN despacho vs acopio</span></div><div class="chart-box"><canvas id="ch-avance"></canvas></div></div>
      <div class="card"><div class="card-h"><h3>TN por día y jornada</h3><span class="muted small">despacho en planta</span></div><div class="chart-box"><canvas id="ch-jornada"></canvas></div></div>
      <div class="card"><div class="card-h"><h3>Participación por transportista</h3><span class="muted small">TN entregadas en puerto</span></div><div class="chart-box"><canvas id="ch-transp"></canvas></div></div>
      <div class="card"><div class="card-h"><h3>Tiempo de atención en puerto</h3><span class="muted small">viajes por rango y día</span></div><div class="chart-box"><canvas id="ch-tiempos"></canvas></div></div>
    </div>
    <div class="grid g57">
      <div class="card"><div class="card-h"><h3>Balance de la operación</h3></div>${balance(t)}</div>
      <div class="card"><div class="card-h"><h3>Últimos viajes</h3><a href="#/viajes" class="btn sm">Ver todos</a></div>
        ${tabla([
          { t: 'N°', k: 'nro' }, { t: 'Placa', f: (v) => `<strong>${esc(v.placa)}</strong>` }, { t: 'Transporte', k: 'transportista_nombre' },
          { t: 'Salida planta', f: (v) => (v.despacho_en ? `${fecha(v.despacho_en).slice(0, 5)} ${String(v.despacho_en).slice(11, 16)}` : '—') }, { t: 'TN origen', k: 'peso_origen', n: 1 }, { t: 'TN destino', k: 'peso_destino', n: 1 },
          { t: 'Status', f: (v) => statusPill(v.status) },
        ], d.ultimos, { empty: 'Aún no hay viajes registrados' })}</div>
    </div>`;

  $('#b-print').onclick = () => print();
  $('#b-fin')?.addEventListener('click', async () => { const { abrirFinalizar } = await import('./finalizar.js?v=__V__'); abrirFinalizar(op, () => { window.dispatchEvent(new CustomEvent('app:ops', { detail: { id: op.id } })); }); });
  $('#b-reabrir')?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Reabrir la operación ${op.nave} · Orden ${op.orden}? Volverá a estado EN CURSO.`))) return;
    await api(`/operaciones/${op.id}/reabrir`, { method: 'POST' }); window.dispatchEvent(new CustomEvent('app:ops', { detail: { id: op.id } }));
  });
  $('#b-xls').onclick = () => descargar(`/api/operaciones/${state.opId}/exportar/detalle`);

  const c = colores();
  const rd = d.reportes_despacho.filter((r) => r.tn_total !== null);
  const ra = d.reportes_acopio.filter((r) => r.tn_total !== null);
  const n = Math.max(rd.length, ra.length);
  chart($('#ch-avance'), {
    type: 'line',
    data: {
      labels: Array.from({ length: n }, (_, i) => `R${i + 1}`),
      datasets: [
        { label: 'Despacho', data: rd.map((r) => r.tn_total), borderColor: c.serie[0], backgroundColor: c.serie[0], tension: .25 },
        { label: 'Acopio', data: ra.map((r) => r.tn_total), borderColor: c.serie[1], backgroundColor: c.serie[1], tension: .25 },
        { label: 'Programado', data: Array(n).fill(t.tn_programadas), borderColor: c.texto, borderDash: [5, 4], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
  });
  const jd = d.jornadas.despacho;
  const dias = [...new Set(jd.map((x) => x.fecha))];
  const jorn = state.catalogos.jornadas;
  chart($('#ch-jornada'), {
    type: 'bar',
    data: {
      labels: dias.map(fecha),
      datasets: [jorn[2], jorn[0], jorn[1]].map((j, i) => ({
        label: j, backgroundColor: c.serie[i], data: dias.map((f) => jd.find((x) => x.fecha === f && x.jornada === j)?.tn || 0),
      })),
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
  });
  const tr = d.transportistas.filter((x) => x.tn_final > 0).sort((a, b) => b.tn_final - a.tn_final);
  chart($('#ch-transp'), {
    type: 'bar',
    data: { labels: tr.map((x) => x.nombre_comercial), datasets: [{ label: 'TN', data: tr.map((x) => x.tn_final), backgroundColor: c.serie[0], borderRadius: 4 }] },
    options: {
      indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${num(ctx.raw)} TN · ${pct(ctx.raw / (t.tn_acopio || 1))}` } } },
    },
  });
  chart($('#ch-tiempos'), {
    type: 'bar',
    data: {
      labels: d.tiempos.map((x) => fecha(x.dia)),
      datasets: state.catalogos.rangos.map((r, i) => ({ label: r, data: d.tiempos.map((x) => x[r]), backgroundColor: [c.ok, c.warn, c.bad][i] })),
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
  });
}

function balance(t) {
  const vs = [['Despachado (planta)', t.tn_despacho, '#2563eb'], ['Acopiado (puerto)', t.tn_acopio, '#10b981'], ['Embarcado', t.tn_embarque, '#8b5cf6'], ['Draft SGS', t.tn_draft_sgs, '#f97316']];
  const max = Math.max(1, ...vs.map((x) => Number(x[1]) || 0));
  return `<div style="display:grid;gap:8px;margin-bottom:12px">${vs.map(([l, v, k]) => `<div style="display:grid;grid-template-columns:150px 1fr 110px;gap:10px;align-items:center;font-size:12.5px">
      <span class="muted" style="font-weight:650">${l}</span>
      <div class="bar" style="margin:0;height:10px;--k:${k}"><i style="width:${(((Number(v) || 0) / max) * 100).toFixed(1)}%"></i></div>
      <b class="num">${num(v)}</b></div>`).join('')}</div>
    ${fichas([
      { l: 'Avance despacho', v: pct(t.pct_despacho), k: '#2563eb' },
      { l: 'Avance acopio', v: pct(t.pct_acopio), k: '#10b981' },
      { l: 'En tránsito', v: num(t.tn_transito), s: `${t.viajes_pendientes} viajes`, k: '#f59e0b' },
      { l: 'Prom. TN / unidad', v: num(t.peso_prom_unidad), k: '#06b6d4' },
      { l: 'Rechazada / devuelta', v: num(t.tn_devueltas), k: '#ef4444' },
      { l: 'Dif. puerto − planta', v: num(t.diferencia_acopio_despacho), s: 'viajes descargados', k: '#06b6d4' },
      { l: 'Dif. embarque − acopio', v: num(t.dif_embarque_acopio), k: '#8b5cf6' },
      { l: 'Dif. draft SGS − embarque', v: num(t.dif_draft_embarque), fuerte: true, k: '#f97316' },
    ], { min: 125 })}`;
}

/* =================== VIAJES =================== */
let filtros = { q: '', t: '', s: '', f: '' };
export async function vViajes(view, ctx) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const [viajes, transp] = await Promise.all([api(`/operaciones/${state.opId}/viajes`), api(`/operaciones/${state.opId}/transportistas`)]);
  const fechas = [...new Set(viajes.map((v) => v.fecha_despacho))].sort();
  view.innerHTML = `<div class="card">
    <div class="card-h">
      <div class="btns">
        <input id="q" type="search" placeholder="Buscar placa, guía o ticket…" style="width:240px" value="${esc(filtros.q)}" aria-label="Buscar">
        <select id="ft" aria-label="Transportista"><option value="">Todos los transportistas</option>${transp.map((t) => `<option value="${t.transportista_id}">${esc(t.nombre_comercial)}</option>`).join('')}</select>
        <select id="fs" aria-label="Status"><option value="">Todos los status</option>${state.catalogos.status.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <select id="ff" aria-label="Día de despacho"><option value="">Todos los días</option>${fechas.map((f) => `<option value="${f}">${fecha(f)}</option>`).join('')}</select>
      </div>
      <div class="btns">
        <button class="btn" id="b-exp">Excel</button>
        <button class="btn" id="b-pdf">PDF</button>
        ${puedeEscribir() ? '<button class="btn primary" id="b-new">+ Nuevo viaje</button>' : ''}
      </div>
    </div>
    <div id="tbl"></div>
  </div>`;
  $('#ft').value = filtros.t; $('#fs').value = filtros.s; $('#ff').value = filtros.f;
  const pintar = () => {
    const q = filtros.q.toUpperCase();
    const fil = viajes.filter((v) => (!q || [v.placa, v.guia, v.ticket].some((x) => String(x || '').toUpperCase().includes(q)))
      && (!filtros.t || String(v.transportista_id) === filtros.t) && (!filtros.s || v.status === filtros.s) && (!filtros.f || v.fecha_despacho === filtros.f));
    const sum = (k) => fil.reduce((s, v) => s + (Number(v[k]) || 0), 0);
    $('#tbl').innerHTML = tabla([
      { t: 'Día despacho', f: (v) => fecha(v.fecha_despacho) }, { t: 'Jornada despacho', k: 'jornada_despacho' }, { t: 'Nro. viaje', k: 'nro' },
      { t: 'Transporte', k: 'transportista_nombre' }, { t: 'Placa', f: (v) => `<strong>${esc(v.placa)}</strong>` }, { t: 'Guía R. Huacho', k: 'guia' },
      { t: 'Peso TN x unid Huacho', k: 'peso_origen', n: 1 }, { t: 'Día recepción', f: (v) => fecha(v.fecha_recepcion) }, { t: 'Jornada recepción', k: 'jornada_recepcion' },
      { t: 'Ticket CSPCP', k: 'ticket' }, { t: 'Peso TN x unid CSPCP', k: 'peso_destino_calc', n: 1 },
      { t: 'Diferencia Huacho - CSPCP', k: 'diferencia', n: 1 }, { t: 'Cant. acum. TN', k: 'acumulado', n: 1 }, { t: 'Cant. rest. TN', k: 'restante', n: 1 },
      { t: 'Tipo de viaje', k: 'tipo' }, { t: 'Hora ingreso CSPCP', f: (v) => fechaHora(v.ingreso_en) }, { t: 'Hora salida CSPCP', f: (v) => fechaHora(v.salida_en) },
      { t: 'Tiempo', f: (v) => minutos(v.tiempo_min) }, { t: 'Rango', f: (v) => rangoPill(v.rango) },
      { t: '# Reporte despacho', k: 'rep_despacho_calc' }, { t: '# Reporte acopio', k: 'rep_acopio_calc' }, { t: 'Viaje x unidad', k: 'vuelta' },
      { t: 'Status', f: (v) => statusPill(v.status) },
      ...(puedeEscribir() ? [{ t: '', f: (v) => `<button class="btn sm" data-edit="${v.id}">Editar</button>` }] : []),
    ], fil, {
      empty: viajes.length ? 'Ningún viaje coincide con el filtro' : 'Aún no hay viajes. Importe el REPORTE HUACHO o regístrelos.',
      foot: [`${fil.length} viajes`, '', '', '', '', '', num(sum('peso_origen')), '', '', '', num(sum('peso_destino_calc')), num(sum('diferencia'))],
    });
  };
  pintar();
  $('#q').addEventListener('input', (e) => { filtros.q = e.target.value; pintar(); });
  $('#ft').addEventListener('change', (e) => { filtros.t = e.target.value; pintar(); });
  $('#fs').addEventListener('change', (e) => { filtros.s = e.target.value; pintar(); });
  $('#ff').addEventListener('change', (e) => { filtros.f = e.target.value; pintar(); });
  $('#b-exp').onclick = () => descargar(`/api/operaciones/${state.opId}/exportar/detalle`);
  $('#b-pdf').onclick = () => descargar(`/api/operaciones/${state.opId}/exportar/detalle-pdf`);
  $('#b-new')?.addEventListener('click', () => viajeModal(null, transp, ctx.rerender));
  $('#tbl').addEventListener('click', (e) => {
    const id = e.target.closest('[data-edit]')?.dataset.edit;
    if (id) viajeModal(viajes.find((v) => v.id === Number(id)), transp, ctx.rerender);
  });
}

function optsTransp(transp, sel) {
  return `<option value="">— Automático por placa —</option>${transp.map((t) => `<option value="${t.transportista_id}" ${t.transportista_id === sel ? 'selected' : ''}>${esc(t.nombre_comercial)}</option>`).join('')}`;
}
const optsJornada = (sel) => `<option value="">Automática</option>${state.catalogos.jornadas.map((j) => `<option ${j === sel ? 'selected' : ''}>${j}</option>`).join('')}`;

export function viajeModal(v, transp, done) {
  const nuevo = !v;
  v = v || {};
  const dlg = modal({
    title: nuevo ? 'Nuevo viaje' : `Viaje N° ${v.nro} · ${v.placa}`,
    wide: true,
    body: `<h3 style="margin-bottom:10px">Despacho en planta</h3>
    <div class="form">
      <label>Placa tracto *<input name="placa" required value="${esc(v.placa || '')}" autocomplete="off" style="text-transform:uppercase"></label>
      <label>Transportista<select name="transportista_id">${optsTransp(transp, v.transportista_id)}</select></label>
      <label>Guía de remisión<input name="guia" value="${esc(v.guia || '')}"></label>
      <label>Peso TN origen<input name="peso_origen" type="number" step="0.01" min="0" max="80" value="${v.peso_origen ?? ''}"></label>
      <label>Fecha-hora salida<input name="despacho_en" type="datetime-local" value="${toInputDT(v.despacho_en) || (nuevo ? ahoraInput() : '')}"></label>
      <label>Día despacho<input name="fecha_despacho" type="date" value="${v.fecha_despacho || (nuevo ? hoyInput() : '')}"></label>
      <label>Jornada despacho<select name="jornada_despacho">${optsJornada(v.jornada_despacho)}</select></label>
      <label># Reporte despacho<input name="rep_despacho" type="number" min="1" value="${v.rep_despacho ?? ''}" placeholder="Auto: ${esc(v.rep_despacho_calc ?? 'por horario')}"></label>
    </div>
    <h3 style="margin:18px 0 10px">Recepción en puerto</h3>
    <div class="form">
      <label>Ticket (use "-" si fue devuelto)<input name="ticket" value="${esc(v.ticket || '')}"></label>
      <label>Peso TN destino<input name="peso_destino" type="number" step="0.01" min="0" max="80" value="${v.peso_destino ?? ''}"></label>
      <label>Fecha - Hora ingreso<input name="ingreso_en" type="datetime-local" value="${toInputDT(v.ingreso_en)}"></label>
      <label>Fecha - Hora salida<input name="salida_en" type="datetime-local" value="${toInputDT(v.salida_en)}"></label>
      <label>Día recepción<input name="fecha_recepcion" type="date" value="${v.fecha_recepcion || ''}"></label>
      <label>Jornada recepción<select name="jornada_recepcion">${optsJornada(v.jornada_recepcion)}</select></label>
      <label># Reporte acopio<input name="rep_acopio" type="number" min="1" value="${v.rep_acopio ?? ''}" placeholder="Auto: ${esc(v.rep_acopio_calc ?? 'por horario')}"></label>
      <label class="full">Observación<input name="observacion" value="${esc(v.observacion || '')}"></label>
    </div>
    ${!nuevo && puedeEscribir() ? '<p style="margin-top:16px"><button type="button" class="btn danger sm" id="b-del">Eliminar viaje</button></p>' : ''}`,
    onSubmit: async (d) => {
      d.placa = normPlaca(d.placa);
      if (nuevo) await api(`/operaciones/${state.opId}/viajes`, { method: 'POST', body: d });
      else await api(`/viajes/${v.id}`, { method: 'PUT', body: d });
      toast(nuevo ? 'Viaje registrado' : 'Viaje actualizado');
      done();
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar el viaje N° ${v.nro} (${v.placa})?`))) return;
    await api(`/viajes/${v.id}`, { method: 'DELETE' });
    dlg.close(); dlg.remove(); toast('Viaje eliminado'); done();
  });
}

/* =================== REGISTRO RÁPIDO (planta / puerto) =================== */
export async function vRegistro(view, ctx) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  if (!puedeEscribir()) { view.innerHTML = '<div class="alert">Su usuario es de sólo lectura.</div>'; return; }
  const [viajes, unidades, transp] = await Promise.all([
    api(`/operaciones/${state.opId}/viajes`), api(`/operaciones/${state.opId}/unidades`), api(`/operaciones/${state.opId}/transportistas`),
  ]);
  const pend = viajes.filter((v) => v.status === 'FALTA DESCARGAR');
  const placas = [...new Set([...unidades.map((u) => u.tracto), ...viajes.map((v) => v.placa)])].sort();
  view.innerHTML = `
  <datalist id="dl-placas">${placas.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
  <datalist id="dl-pend">${[...new Set(pend.map((p) => p.placa))].map((p) => `<option value="${esc(p)}">En tránsito</option>`).join('')}${placas.filter((p) => !pend.some((x) => x.placa === p)).map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>1 · Salida de planta (despacho)</h2></div>
      <form id="f-desp" class="form" autocomplete="off">
        <label>Placa tracto *<input name="placa" list="dl-placas" required style="text-transform:uppercase"></label>
        <label>Transportista<select name="transportista_id">${optsTransp(transp)}</select></label>
        <label>Guía de remisión *<input name="guia" required></label>
        <label>Peso TN *<input name="peso_origen" type="number" step="0.01" min="0" max="80" required></label>
        <label>Fecha-hora salida *<input name="despacho_en" type="datetime-local" required value="${ahoraInput()}"></label>
        <label>Jornada<select name="jornada_despacho">${optsJornada()}</select></label>
        <div class="full muted small" id="info-desp"></div>
        <div class="full"><button class="btn primary">Registrar despacho</button></div>
      </form></div>
    <div class="card"><div class="card-h"><h2>2 · Recepción en puerto (ticket)</h2></div>
      <form id="f-rec" class="form" autocomplete="off">
        <label>Placa tracto *<input name="placa" list="dl-pend" required style="text-transform:uppercase"></label>
        <label>N° ticket *<input name="ticket" required></label>
        <label>Peso neto TN *<input name="peso_destino" type="number" step="0.01" min="0" max="80"></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="devuelto"> Carga devuelta / no ingresó</label>
        <label>Fecha - Hora ingreso<input name="ingreso_en" type="datetime-local" value="${ahoraInput()}"></label>
        <label>Fecha - Hora salida<input name="salida_en" type="datetime-local"></label>
        <label>Jornada<select name="jornada_recepcion">${optsJornada()}</select></label>
        <div class="full muted small" id="info-rec"></div>
        <div class="full"><button class="btn primary">Registrar recepción</button></div>
      </form></div>
  </div>
  <div class="card"><div class="card-h"><h2>Unidades en tránsito</h2><span class="muted">${pend.length} viajes · ${num(pend.reduce((s, v) => s + (v.peso_origen || 0), 0))} TN</span></div>
    ${tabla([
      { t: 'N°', k: 'nro' }, { t: 'Placa', f: (v) => `<strong>${esc(v.placa)}</strong>` }, { t: 'Transporte', k: 'transportista_nombre' },
      { t: 'Guía', k: 'guia' }, { t: 'TN', k: 'peso_origen', n: 1 }, { t: 'Salida planta', f: (v) => fechaHora(v.despacho_en) },
      { t: 'Vuelta', k: 'vuelta' }, { t: '', f: (v) => `<button class="btn sm" data-rec="${esc(v.placa)}">Recibir</button>` },
    ], pend, { empty: 'No hay unidades en tránsito' })}</div>`;

  const fD = $('#f-desp'), fR = $('#f-rec');
  // Jornada automática según la fecha-hora (el turno de las 23:00 cuenta para el día siguiente)
  const jornadaAuto = (sel, inp) => {
    const val = Array.isArray(inp) ? inp.map((x) => x.value).find(Boolean) : inp.value;
    const t = turnoDe(String(val || '').replace('T', ' '));
    sel.options[0].textContent = t.jornada ? `Automática: ${t.jornada}` : 'Automática';
  };
  // Recepción: manda la hora de salida del puerto; mientras no se ingrese, se toma la de ingreso
  for (const [sel, inp] of [[fD.jornada_despacho, [fD.despacho_en]], [fR.jornada_recepcion, [fR.salida_en, fR.ingreso_en]]]) {
    for (const i of inp) { i.addEventListener('change', () => jornadaAuto(sel, inp)); i.addEventListener('input', () => jornadaAuto(sel, inp)); }
    jornadaAuto(sel, inp);
  }
  fD.placa.addEventListener('change', () => {
    const p = normPlaca(fD.placa.value); fD.placa.value = p;
    const u = unidades.find((x) => x.tracto === p);
    const vs = viajes.filter((v) => v.placa === p);
    if (u?.transportista_id) fD.transportista_id.value = u.transportista_id;
    $('#info-desp').textContent = u ? `${u.transportista_nombre || ''} · ${[u.ap_paterno, u.ap_materno, u.nombre1].filter(Boolean).join(' ')} · DNI ${u.dni || '—'} · Plataforma ${u.plataforma || '—'} · ${vs.length} viajes previos`
      : p ? `Placa no registrada en la lista de unidades · ${vs.length} viajes previos` : '';
  });
  fD.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(fD));
    d.placa = normPlaca(d.placa);
    try {
      const v = await api(`/operaciones/${state.opId}/viajes`, { method: 'POST', body: d });
      toast(`Despacho registrado: viaje N° ${v.nro}, ${v.placa} (vuelta ${v.vuelta})`);
      ctx.rerender();
    } catch (err) { toast(err.message, true); }
  });
  fR.devuelto.addEventListener('change', () => { if (fR.devuelto.checked) { fR.ticket.value = '-'; } else if (fR.ticket.value === '-') fR.ticket.value = ''; });
  fR.placa.addEventListener('change', () => {
    const p = normPlaca(fR.placa.value); fR.placa.value = p;
    const v = pend.find((x) => x.placa === p);
    $('#info-rec').textContent = v ? `Se asignará al viaje N° ${v.nro} · guía ${v.guia || '—'} · ${num(v.peso_origen)} TN despachadas ${fechaHora(v.despacho_en)}` : p ? 'Esta placa no tiene viajes pendientes de descarga' : '';
  });
  fR.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(fR));
    d.placa = normPlaca(d.placa);
    if (fR.devuelto.checked) d.ticket = '-';
    try {
      const v = await api(`/operaciones/${state.opId}/recepcion`, { method: 'POST', body: d });
      toast(`Recepción registrada: viaje N° ${v.nro} · ${v.placa} · dif. ${num(v.diferencia)} TN`);
      ctx.rerender();
    } catch (err) { toast(err.message, true); }
  });
  view.addEventListener('click', (e) => {
    const p = e.target.closest('[data-rec]')?.dataset.rec;
    if (!p) return;
    fR.placa.value = p; fR.placa.dispatchEvent(new Event('change'));
    fR.ingreso_en.value = ahoraInput(); jornadaAuto(fR.jornada_recepcion, [fR.salida_en, fR.ingreso_en]);
    fR.ticket.focus();
    fR.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
