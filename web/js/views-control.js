import {
  state, api, esc, num, fecha, fechaHora, fechaHoraOpc, horas, toInputDT, normPlaca, toast, $, modal, confirmar,
  tabla, sinOperacion, puedeEscribir, esAdmin, chart, colores, descargar, descargarBlob,
} from './core.js?v=__V__';
import { NOMBRES_VUELTA } from './calc.js?v=__V__';
import { formularioLista, enviarLista } from './views-admin.js?v=__V__';

/* =================== REPORTES POR TURNO =================== */
let tabRep = 'despacho';
export async function vReportes(view, ctx) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const d = await api(`/operaciones/${state.opId}/reportes`);
  const edit = puedeEscribir();
  view.innerHTML = `<div class="card">
    <div class="tabs" role="tablist">
      ${[['despacho', 'Proceso de despacho'], ['acopio', 'Proceso de acopio'], ['embarque', 'Proceso de embarque']]
        .map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tabRep === k ? 'active' : ''}" aria-selected="${tabRep === k}">${l}</button>`).join('')}
    </div><div id="rep-body"></div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tabRep = b.dataset.tab; ctx.rerender(); }));
  const body = $('#rep-body');
  const acc = (r) => (edit ? `<button class="btn sm" data-r="${r.id}">Editar</button>` : '');

  if (tabRep !== 'embarque') {
    pintarCortes(body, d[tabRep], tabRep, edit, ctx);
    return;
  } else {
    const e = d.embarque;
    body.innerHTML = `
      <div class="kpis" style="margin-bottom:14px">
        <div class="kpi"><div class="l">TN programadas</div><div class="v">${num(e.tn_programadas, 0)}</div></div>
        <div class="kpi"><div class="l">TN embarcadas</div><div class="v">${num(e.tn_embarcadas)}</div>
          <div class="bar"><i style="width:${Math.min(100, ((e.tn_embarcadas || 0) / (e.tn_programadas || 1)) * 100)}%"></i></div></div>
        <div class="kpi"><div class="l">TN restantes</div><div class="v">${num(e.tn_restantes)}</div></div>
        <div class="kpi"><div class="l">Draft SGS</div><div class="v">${num(e.tn_draft_sgs)}</div><div class="s">Dif.: ${num(e.tn_draft_sgs != null && e.tn_embarcadas != null ? e.tn_draft_sgs - e.tn_embarcadas : null)}</div></div>
      </div>
      <div class="card-h"><h3>Etapas (status)</h3>${edit ? '<button class="btn" id="b-etapa">+ Etapa</button>' : ''}</div>
      ${tabla([
        { t: 'Status', k: 'nombre' }, { t: 'Inicio', f: (x) => fechaHora(x.inicio) }, { t: 'Fin', f: (x) => fechaHora(x.fin) },
        { t: 'Tiempo', f: (x) => horas(x.horas) }, { t: 'Observación', k: 'observacion' },
        { t: '', f: (x) => (edit ? `<button class="btn sm" data-et="${x.id}">Editar</button>` : '') },
      ], e.etapas, { empty: 'Sin etapas registradas (ej. 1ETB, 2ETB)', foot: ['Total', '', '', horas(e.horas_etapas)] })}
      <div class="card-h" style="margin-top:18px"><h3>Reportes de embarque</h3>${edit ? '<button class="btn primary" id="b-add">+ Nuevo reporte</button>' : ''}</div>
      ${tabla([
        { t: 'Reporte', f: (r) => `<strong>${r.numero}° reporte</strong>` }, { t: 'Inicio', f: (r) => fechaHora(r.inicio) }, { t: 'Fin', f: (r) => fechaHora(r.fin) },
        { t: 'TN parcial', k: 'tn_parcial', n: 1 }, { t: '# Horas', f: (r) => horas(r.horas) }, { t: 'Prom. TN x hr', k: 'tn_x_hora', n: 1 },
        { t: 'TN total', k: 'tn_total', n: 1 }, { t: 'Hrs. total', f: (r) => horas(r.horas_total) }, { t: 'TN restantes', k: 'tn_restantes', n: 1 },
        { t: 'Hrs. est. rest.', f: (r) => horas(r.horas_est_rest) }, { t: 'Fch. est. término', f: (r) => fechaHora(r.fecha_est_termino) },
        { t: '', f: acc },
      ], e.reportes, { empty: 'Sin reportes de embarque' })}`;
    $('#b-etapa')?.addEventListener('click', () => etapaModal(null, ctx.rerender));
    body.addEventListener('click', (ev) => {
      const id = ev.target.closest('[data-et]')?.dataset.et;
      if (id) etapaModal(e.etapas.find((x) => x.id === Number(id)), ctx.rerender);
    });
  }
  const todos = tabRep === 'embarque' ? d.embarque.reportes : d[tabRep];
  $('#b-add')?.addEventListener('click', () => {
    const prev = todos[todos.length - 1];
    reporteModal({ tipo: tabRep, numero: (prev?.numero || 0) + 1, inicio: prev?.fin || '' }, ctx.rerender, true);
  });
  body.addEventListener('click', (ev) => {
    const id = ev.target.closest('[data-r]')?.dataset.r;
    if (id) reporteModal(todos.find((r) => r.id === Number(id)), ctx.rerender, false);
  });
}

export const ordinal = (n) => `${n}${({ 1: 'er', 2: 'do', 3: 'er', 4: 'to', 5: 'to', 6: 'to', 7: 'mo', 8: 'vo', 9: 'no', 0: 'mo' })[n % 10]}`
  .replace(/^11er$/, '11mo').replace(/^12do$/, '12mo').replace(/^13er$/, '13er');

/** PROCESO DE DESPACHO / ACOPIO: avance por cortes (como la hoja REPORTES). */
function pintarCortes(body, cortes, proceso, edit, ctx) {
  const P = proceso === 'despacho' ? 'DESPACHO' : 'ACOPIO';
  const hechos = cortes.filter((r) => r.tn_total !== null);
  const u = hechos[hechos.length - 1];
  const prog = state.ops.find((o) => o.id === state.opId)?.tn_programadas || 0;
  const tph = u && u.horas_total ? u.tn_total / u.horas_total : null;
  const filas = [
    ['INICIO', (r) => fechaHora(r.inicio)], ['CIERRE', (r) => fechaHora(r.fin)],
    ['TN PARCIAL', (r) => num(r.tn_parcial), true], ['# VIAJES', (r) => num(r.viajes, 0)], ['# HORAS', (r) => horas(r.horas)],
    ['Ø TN X UNID.', (r) => num(r.tn_x_unidad)], ['Ø UNID. X HR', (r) => num(r.unid_x_hora)],
    ['TN TOTAL', (r) => num(r.tn_total), true], ['VIAJES TOTAL', (r) => num(r.viajes_total, 0)], ['HRS. TOTAL', (r) => horas(r.horas_total)],
    ['TN RESTANTES', (r) => num(r.tn_restantes), true], ['VIAJES EST. REST.', (r) => num(r.viajes_est_rest, 0)],
    ['HRS. EST. REST.', (r) => horas(r.horas_est_rest)], ['FCH. EST. TERM.', (r) => fechaHora(r.fecha_est_termino), true],
  ];
  body.innerHTML = `
    <div class="card-h"><div><h2>PROCESO DE ${P}</h2>
      <p class="muted small" style="margin:4px 0 0">El 1er reporte inicia con la hora de ${proceso === 'despacho' ? 'despacho de la 1ra unidad (REPORTE HUACHO)' : 'ingreso al puerto de la 1ra unidad (REPORTE CSPCP)'};
      cada reporte cierra con la fecha y hora indicada al importar, y ese cierre es el inicio del siguiente.</p></div>
      <div class="btns"><button class="btn" id="c-xls">Excel</button><button class="btn" id="c-pdf">PDF</button>
      ${edit ? `<a class="btn primary" href="#/importar">Importar ${proceso === 'despacho' ? 'REPORTE HUACHO' : 'REPORTE CSPCP'}</a>` : ''}</div></div>
    ${!cortes.length ? `<div class="empty">Aún no hay reportes de ${proceso}. Se crean al importar el ${proceso === 'despacho' ? 'REPORTE HUACHO' : 'REPORTE CSPCP'} indicando la fecha y hora de cierre.</div>` : `
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="l">TN total ${proceso}</div><div class="v">${num(u?.tn_total)}</div>
        <div class="s">${prog ? `${num(Math.min(100, ((u?.tn_total || 0) / prog) * 100), 1)} % de ${num(prog, 0)} TN` : ''}</div>
        ${prog ? `<div class="bar ${u?.tn_total >= prog ? 'ok' : ''}"><i style="width:${Math.min(100, ((u?.tn_total || 0) / prog) * 100)}%"></i></div>` : ''}</div>
      <div class="kpi"><div class="l">Reportes (cortes)</div><div class="v">${cortes.length}</div><div class="s">${u ? `último: ${fechaHora(u.fin)}` : ''}</div></div>
      <div class="kpi"><div class="l">Ritmo promedio</div><div class="v">${num(tph)}</div><div class="s">TN por hora · ${num(u?.horas_total ? u.viajes_total / u.horas_total : null)} unid./h</div></div>
      <div class="kpi"><div class="l">TN restantes</div><div class="v">${num(u?.tn_restantes)}</div><div class="s">${num(u?.viajes_est_rest, 0)} viajes estimados</div></div>
      <div class="kpi"><div class="l">Fecha est. término</div><div class="v" style="font-size:19px">${fechaHora(u?.fecha_est_termino)}</div><div class="s">faltan ${horas(u?.horas_est_rest)} h</div></div>
    </div>
    <div class="grid g2" style="margin-bottom:16px">
      <div class="card"><div class="card-h"><h3>TN por reporte y acumulado</h3><span class="muted small">clic en una barra para ver sus viajes</span></div><div class="chart-box"><canvas id="c-tn"></canvas></div></div>
      <div class="card"><div class="card-h"><h3>Ritmo por reporte</h3><span class="muted small">unidades por hora y TN por unidad</span></div><div class="chart-box"><canvas id="c-ritmo"></canvas></div></div>
    </div>
    <div class="table-wrap" style="max-height:none"><table class="matriz">
      <thead><tr><th style="position:sticky;left:0;z-index:2">PROCESO DE ${P}</th>${cortes.map((r) => `<th class="num" style="text-align:center">
        <button class="btn sm" data-ver="${r.numero}" title="Ver viajes de este reporte">${ordinal(r.numero)} REPORTE</button></th>`).join('')}</tr></thead>
      <tbody>${filas.map(([l, f, fuerte]) => `<tr><th style="position:sticky;left:0;background:var(--surface-2)">${l}</th>${cortes.map((r) => `<td class="num" style="text-align:center">${fuerte ? `<strong>${f(r)}</strong>` : f(r)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${edit ? `<tfoot><tr><td style="position:sticky;left:0"></td>${cortes.map((r, i) => `<td style="text-align:center"><button class="btn sm" data-r="${r.id}">Editar cierre</button>${i === cortes.length - 1 ? ` <button class="btn sm danger" data-del="${r.id}">Eliminar</button>` : ''}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>`}`;
  if (cortes.length) {
    const c = colores();
    const etiquetas = cortes.map((r) => `${ordinal(r.numero)} rep.`);
    chart($('#c-tn'), {
      data: { labels: etiquetas, datasets: [
        { type: 'bar', label: 'TN parcial', data: cortes.map((r) => r.tn_parcial), backgroundColor: c.serie[0], borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: 'TN acumulada', data: cortes.map((r) => r.tn_total), borderColor: c.serie[1], backgroundColor: c.serie[1], tension: 0.25, yAxisID: 'y' },
        ...(prog ? [{ type: 'line', label: 'Programado', data: cortes.map(() => prog), borderColor: c.texto, borderDash: [5, 4], pointRadius: 0, borderWidth: 1, yAxisID: 'y' }] : []),
      ] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } },
        onClick: (e, els) => { if (els[0]) verViajes(proceso, cortes[els[0].index]); } },
    });
    chart($('#c-ritmo'), {
      type: 'line',
      data: { labels: etiquetas, datasets: [
        { label: 'Unid. por hora', data: cortes.map((r) => r.unid_x_hora), borderColor: c.serie[2], backgroundColor: c.serie[2], tension: 0.25, yAxisID: 'y' },
        { label: 'TN por unidad', data: cortes.map((r) => r.tn_x_unidad), borderColor: c.serie[3], backgroundColor: c.serie[3], tension: 0.25, yAxisID: 'y1' },
      ] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: false, position: 'right', grid: { drawOnChartArea: false } } } },
    });
  }
  body.addEventListener('click', async (e) => {
    const n = e.target.closest('[data-ver]')?.dataset.ver;
    if (n) return verViajes(proceso, cortes.find((r) => r.numero === Number(n)));
    const ed = e.target.closest('[data-r]')?.dataset.r;
    if (ed) return corteModal(cortes.find((r) => r.id === Number(ed)), ctx.rerender, false);
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) {
      const r = cortes.find((x) => x.id === Number(del));
      if (!(await confirmar(`¿Eliminar el ${ordinal(r.numero)} reporte de ${proceso}? Sus viajes pasarán al siguiente reporte que se cree.`))) return;
      try { await api(`/reportes/${r.id}`, { method: 'DELETE' }); ctx.rerender(); } catch (err) { toast(err.message, true); }
    }
  });
  $('#c-xls', body).onclick = async () => { const { exportarCortes } = await import('./excel.js?v=__V__'); const op = state.ops.find((o) => o.id === state.opId);
    descargarBlob(await exportarCortes(op, proceso, cortes, ordinal), `${op.nombre || `${op.nave} - ORDEN ${op.orden}`} - REPORTES ${P}.xlsx`); };
  $('#c-pdf', body).onclick = async () => { const { pdfCortes } = await import('./pdf.js?v=__V__'); const op = state.ops.find((o) => o.id === state.opId);
    descargarBlob(await pdfCortes(await api(`/operaciones/${state.opId}`), proceso, cortes, ordinal), `${op.nombre || `${op.nave} - ORDEN ${op.orden}`} - REPORTES ${P}.pdf`); };
}

async function verViajes(proceso, r) {
  const vs = (await api(`/operaciones/${state.opId}/viajes`)).filter((v) => (proceso === 'despacho' ? v.rep_despacho_calc : v.rep_acopio_calc) === r.numero
    && (proceso === 'despacho' || v.status !== 'FALTA DESCARGAR'));
  const k = proceso === 'despacho' ? 'peso_origen' : 'peso_destino_calc';
  modal({
    title: `${ordinal(r.numero)} reporte de ${proceso}: ${fechaHora(r.inicio)} a ${fechaHora(r.fin)}`, wide: true,
    body: tabla([
      { t: 'N° viaje', k: 'nro' }, { t: 'Transporte', k: 'transportista_nombre' }, { t: 'Placa', k: 'placa' }, { t: 'Guía', k: 'guia' },
      { t: proceso === 'despacho' ? 'Despacho' : 'Ingreso CSPCP', f: (v) => fechaHora(proceso === 'despacho' ? v.despacho_en : v.ingreso_en) },
      { t: proceso === 'despacho' ? 'TN Huacho' : 'TN CSPCP', k, n: 1 },
    ], vs, { empty: 'Sin viajes en este reporte', foot: [`${vs.length} viajes`, '', '', '', '', num(vs.reduce((s, v) => s + (v[k] || 0), 0))] }),
  });
}

function reporteModal(r, done, nuevo) {
  const emb = r.tipo === 'embarque';
  if (!emb) return corteModal(r, done, nuevo);
  const dlg = modal({
    title: nuevo ? `Nuevo reporte de ${r.tipo}` : `${r.numero}° reporte de ${r.tipo}`,
    body: `<div class="form">
      <label>N° reporte<input name="numero" type="number" min="1" value="${r.numero}" ${nuevo ? '' : 'disabled'}></label>
      <label>Inicio *<input name="inicio" type="datetime-local" required value="${toInputDT(r.inicio)}"></label>
      <label>Fin<input name="fin" type="datetime-local" value="${toInputDT(r.fin)}"></label>
      ${emb ? `<label>TN total embarcadas al cierre<input name="tn_acumulado" type="number" step="0.01" min="0" value="${r.tn_acumulado ?? ''}"></label>` : ''}
      <label class="full">Observación<input name="observacion" value="${esc(r.observacion || '')}"></label>
      ${!nuevo ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar reporte</button></div>' : ''}
    </div>`,
    onSubmit: async (d) => {
      if (nuevo) await api(`/operaciones/${state.opId}/reportes`, { method: 'POST', body: { ...d, tipo: r.tipo } });
      else await api(`/reportes/${r.id}`, { method: 'PUT', body: d });
      toast('Reporte guardado'); done();
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar el ${r.numero}° reporte de ${r.tipo}?`))) return;
    await api(`/reportes/${r.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); done();
  });
}

function corteModal(r, done, nuevo) {
  modal({
    title: nuevo ? `Nuevo reporte de ${r.tipo} (manual)` : `Cierre del ${ordinal(r.numero)} reporte de ${r.tipo}`,
    body: `<div class="form">
      <p class="full muted" style="margin:0">Inicio: <strong>${r.inicio ? fechaHora(r.inicio) : 'hora de la 1ra unidad'}</strong>${nuevo ? ' (cierre del reporte anterior)' : ''}. Al cambiar el cierre, el siguiente reporte empieza en esa nueva hora.</p>
      <label>Fecha y hora de cierre *<input name="fin" type="datetime-local" required value="${toInputDT(r.fin)}"></label>
      <label class="full">Observación<input name="observacion" value="${esc(r.observacion || '')}"></label></div>`,
    onSubmit: async (d) => {
      if (nuevo) await api(`/operaciones/${state.opId}/reportes`, { method: 'POST', body: { ...d, tipo: r.tipo } });
      else await api(`/reportes/${r.id}`, { method: 'PUT', body: { ...d, inicio: r.inicio } });
      toast('Reporte guardado'); done();
    },
  });
}

function etapaModal(e, done) {
  const nuevo = !e; e = e || {};
  const dlg = modal({
    title: nuevo ? 'Nueva etapa de embarque' : `Etapa ${e.nombre}`,
    body: `<div class="form">
      <label>Status *<input name="nombre" required value="${esc(e.nombre || '')}" placeholder="1ETB"></label>
      <label>Inicio<input name="inicio" type="datetime-local" value="${toInputDT(e.inicio)}"></label>
      <label>Fin<input name="fin" type="datetime-local" value="${toInputDT(e.fin)}"></label>
      <label class="full">Observación<input name="observacion" value="${esc(e.observacion || '')}"></label>
      ${!nuevo ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar etapa</button></div>' : ''}</div>`,
    onSubmit: async (d) => {
      if (nuevo) await api(`/operaciones/${state.opId}/etapas`, { method: 'POST', body: d });
      else await api(`/etapas/${e.id}`, { method: 'PUT', body: d });
      done();
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    await api(`/etapas/${e.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); done();
  });
}

/* =================== TRANSPORTISTAS =================== */
export async function vTransportistas(view, ctx) {
  const edit = puedeEscribir();
  const [todos, tab] = await Promise.all([
    api('/transportistas'),
    state.opId ? api(`/operaciones/${state.opId}/tablero`) : Promise.resolve(null),
  ]);
  const res = tab?.transportistas || [];
  const tot = (k) => res.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  view.innerHTML = `
  ${tab ? `<div class="card"><div class="card-h"><h2>Participación en la operación</h2>
      <div class="btns"><button class="btn" id="b-all-xls">Todos los reportes (Excel)</button><button class="btn" id="b-all-pdf">Todos los reportes (PDF)</button>
      ${edit ? '<button class="btn" id="b-part">+ Agregar transportista</button>' : ''}</div></div>
    ${tabla([
      // Columnas de la hoja TRANSPORTISTAS del Excel (C a N; TRANSPORTE, columna B, sigue oculta)
      { t: 'Razón social', f: (x) => `<strong>${esc(x.razon_social)}</strong>` }, { t: 'RUC', k: 'ruc' },
      { t: 'Unidades solicitadas', k: 'unidades_solicitadas', n: 1, d: 0 }, { t: 'Unidades en lista', k: 'unidades_en_lista', n: 1, d: 0 },
      { t: 'TN prom. x unidad', k: 'tn_prom_unidad', n: 1 },
      { t: 'Viajes aprox.', k: 'viajes_aprox', n: 1, d: 0 }, { t: 'Total aprox. TN', k: 'tn_aprox', n: 1 },
      { t: 'Unidades activas', k: 'unidades_activas', n: 1, d: 0 },
      { t: 'Viajes realizados', k: 'viajes_realizados', n: 1, d: 0 }, { t: 'Total final TN', k: 'tn_final', n: 1 },
      { t: 'Observación', f: (x) => esc(x.observacion || x.observacion_calc || '') },
      { t: 'Reporte confirmado', f: (x) => (x.reporte_confirmado ? '<span class="pill ok">Sí</span>' : '<span class="pill warn">No</span>') },
      { t: 'Reporte', f: (x) => (x.viajes_realizados ? `<div class="btns" style="flex-wrap:nowrap"><a class="btn sm" href="#/reporte-transportista?t=${x.transportista_id}">Ver</a>
          <button class="btn sm" data-xls="${x.transportista_id}">Excel</button><button class="btn sm" data-pdf="${x.transportista_id}">PDF</button></div>` : '<span class="muted">—</span>') },
      { t: '', f: (x) => (edit ? `<button class="btn sm" data-part="${x.transportista_id}">Editar</button>` : '') },
    ], res, {
      empty: 'Ningún transportista asignado a la operación',
      foot: ['Total', `${res.length}`, num(tot('unidades_solicitadas'), 0), num(tot('unidades_en_lista'), 0), '', num(tot('viajes_aprox'), 0), num(tot('tn_aprox')),
        num(tot('unidades_activas'), 0), num(tot('viajes_realizados'), 0), num(tot('tn_final'))],
    })}</div>
  <div class="card"><div class="card-h"><div><h2>Detallado por vueltas (TN)</h2>
      <p class="muted small" style="margin:4px 0 0">1ª vuelta = unidades solicitadas × TN prom. por unidad · vueltas 2-10 = 1ª vuelta × n · las vueltas en <strong>negrita</strong> fueron ingresadas a mano · TOTAL TN = mayor valor (es el "Total aprox. TN").</p></div></div>
    ${tabla([
      { t: 'Razón social', f: (x) => `<strong>${esc(x.razon_social)}</strong>` },
      ...NOMBRES_VUELTA.map((nom, i) => ({ t: nom, n: 1, f: (x) => { const v = x.vueltas[i]; return v.tn === null ? '' : v.manual ? `<strong>${num(v.tn, 0)}</strong>` : num(v.tn, 0); } })),
      { t: 'TOTAL TN', n: 1, f: (x) => `<strong>${num(x.tn_aprox, 0)}</strong>` },
      ...(edit ? [{ t: '', f: (x) => `<button class="btn sm" data-part="${x.transportista_id}">Editar</button>` }] : []),
    ], res, {
      empty: 'Ningún transportista asignado a la operación',
      foot: ['Total', ...NOMBRES_VUELTA.map((_, i) => num(res.reduce((s, x) => s + (x.vueltas[i].tn || 0), 0), 0)), num(tot('tn_aprox'), 0)],
    })}</div>` : sinOperacion()}
  <div class="card"><div class="card-h"><h2>Maestro de transportistas</h2>${edit ? '<button class="btn primary" id="b-new">+ Nuevo transportista</button>' : ''}</div>
    ${tabla([
      { t: 'Nombre comercial', k: 'nombre_comercial' }, { t: 'Razón social', k: 'razon_social' }, { t: 'RUC', k: 'ruc' },
      { t: 'Contacto', k: 'contacto' }, { t: 'Teléfono', k: 'telefono' }, { t: 'Correos', f: (x) => esc(x.emails || '—') },
      { t: '', f: (x) => (edit ? `<button class="btn sm" data-t="${x.id}">Editar</button>` : '') },
    ], todos, { empty: 'No hay transportistas registrados' })}</div>`;

  $('#b-new')?.addEventListener('click', () => transpModal(null, ctx.rerender));
  $('#b-part')?.addEventListener('click', () => partModal(null, todos.filter((t) => !res.some((r) => r.transportista_id === t.id)), ctx.rerender));
  view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t) return transpModal(todos.find((x) => x.id === Number(t)), ctx.rerender);
    const p = e.target.closest('[data-part]')?.dataset.part;
    if (p) return partModal(res.find((x) => x.transportista_id === Number(p)), [], ctx.rerender);
    const x = e.target.closest('[data-xls]')?.dataset.xls;
    if (x) return descargar(`/api/operaciones/${state.opId}/exportar/transportista/${x}`);
    const pd = e.target.closest('[data-pdf]')?.dataset.pdf;
    if (pd) descargar(`/api/operaciones/${state.opId}/exportar/transportista-pdf/${pd}`);
  });
  $('#b-all-xls')?.addEventListener('click', () => descargar(`/api/operaciones/${state.opId}/exportar/transportistas`));
  $('#b-all-pdf')?.addEventListener('click', () => descargar(`/api/operaciones/${state.opId}/exportar/transportistas-pdf`));
}

function transpModal(t, done) {
  const nuevo = !t; t = t || {};
  const dlg = modal({
    title: nuevo ? 'Nuevo transportista' : t.nombre_comercial,
    body: `<div class="form">
      <label>RUC *<input name="ruc" required pattern="\\d{11}" maxlength="11" inputmode="numeric" value="${esc(t.ruc || '')}"></label>
      <label class="full">Razón social *<input name="razon_social" required value="${esc(t.razon_social || '')}"></label>
      <label>Nombre comercial *<input name="nombre_comercial" required value="${esc(t.nombre_comercial || '')}" placeholder="TOLVEROS"></label>
      <label>Contacto<input name="contacto" value="${esc(t.contacto || '')}"></label>
      <label>Teléfono<input name="telefono" value="${esc(t.telefono || '')}"></label>
      <label class="full">Correos (separados por coma)<input name="emails" value="${esc(t.emails || '')}"></label>
      ${!nuevo && esAdmin() ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar</button></div>' : ''}</div>`,
    onSubmit: async (d) => {
      if (nuevo) await api('/transportistas', { method: 'POST', body: d });
      else await api(`/transportistas/${t.id}`, { method: 'PUT', body: d });
      toast('Transportista guardado'); done();
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar ${t.nombre_comercial}?`))) return;
    try { await api(`/transportistas/${t.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); done(); } catch (e) { toast(e.message, true); }
  });
}

function partModal(p, disponibles, done) {
  const nuevo = !p; p = p || { unidades_solicitadas: 0, tn_prom_unidad: 33 };
  const dlg = modal({
    title: nuevo ? 'Agregar transportista a la operación' : `Participación de ${p.nombre_comercial}`,
    wide: true,
    body: `<div class="form">
      ${nuevo ? `<label class="full">Transportista *<select name="tid" required>${disponibles.map((t) => `<option value="${t.id}">${esc(t.nombre_comercial)} — ${esc(t.razon_social)}</option>`).join('')}</select></label>` : ''}
      <label>Unidades solicitadas<input name="unidades_solicitadas" type="number" min="0" value="${p.unidades_solicitadas ?? 0}"></label>
      <label>TN prom. por unidad<input name="tn_prom_unidad" type="number" step="0.1" min="1" value="${p.tn_prom_unidad ?? 33}"></label>
      <label class="check"><input type="checkbox" name="reporte_confirmado" ${p.reporte_confirmado ? 'checked' : ''}> Reporte confirmado</label>
      <div class="full"><h3 style="margin:8px 0 2px">Detallado por vueltas (TN)</h3>
        <p class="muted small" style="margin:0">Deje en blanco para el cálculo automático (unidades × TN prom. × n, hasta la 10ª vuelta). Escriba un valor para fijarlo a mano, como en el Excel (p. ej. la 11ª vuelta).</p></div>
      ${NOMBRES_VUELTA.map((nom, i) => {
        const man = p.vueltas_manual?.[i + 1];
        const auto = i < 10 ? Math.round((p.unidades_solicitadas || 0) * (p.tn_prom_unidad || 0) * (i + 1) * 100) / 100 : '';
        return `<label>${nom}<input name="v${i + 1}" type="number" step="0.01" min="0" value="${man ?? ''}" placeholder="${auto === '' ? '—' : auto}" data-n="${i + 1}"></label>`;
      }).join('')}
      <label class="full">Observación<input name="observacion" value="${esc(p.observacion || '')}"></label>
      ${!nuevo ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Quitar de la operación</button></div>' : ''}</div>`,
    onSubmit: async (d) => {
      const tid = nuevo ? d.tid : p.transportista_id;
      if (!tid) throw new Error('Seleccione un transportista');
      await api(`/operaciones/${state.opId}/transportistas/${tid}`, { method: 'PUT', body: d });
      done();
    },
  });
  const f = dlg.querySelector('form');
  const actualizar = () => {
    const base = (Number(f.unidades_solicitadas.value) || 0) * (Number(f.tn_prom_unidad.value) || 0);
    f.querySelectorAll('[data-n]').forEach((el) => { const n = Number(el.dataset.n); if (n <= 10) el.placeholder = String(Math.round(base * n * 100) / 100); });
  };
  f.unidades_solicitadas.addEventListener('input', actualizar);
  f.tn_prom_unidad.addEventListener('input', actualizar);
  $('#b-del', dlg)?.addEventListener('click', async () => {
    await api(`/operaciones/${state.opId}/transportistas/${p.transportista_id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); done();
  });
}

/* =================== LISTA DE UNIDADES =================== */
let qU = '';
export async function vUnidades(view, ctx) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const edit = puedeEscribir();
  const [us, transp, tab] = await Promise.all([api(`/operaciones/${state.opId}/unidades`), api('/transportistas'), api(`/operaciones/${state.opId}/tablero`)]);
  const viajesPor = new Map(tab.unidades.unidades.map((u) => [u.placa, u]));
  view.innerHTML = `<div class="card"><div class="card-h">
      <div class="btns"><input id="q" type="search" placeholder="Buscar placa, DNI o conductor…" value="${esc(qU)}" style="width:260px" aria-label="Buscar">
      <span class="muted">${us.length} unidades en lista · ${tab.totales.unidades_activas} activas</span></div>
      ${edit ? '<div class="btns"><button class="btn" id="b-copiar">Copiar lista de otra operación</button><button class="btn" id="b-imp-lista">Importar lista (uno o varios archivos)</button><button class="btn primary" id="b-new">+ Nueva unidad</button></div>' : ''}</div><div id="tbl"></div></div>`;
  const pintar = () => {
    const q = qU.toUpperCase();
    const fil = us.filter((u) => !q || [u.tracto, u.plataforma, u.dni, u.ap_paterno, u.ap_materno, u.nombre1].some((x) => String(x || '').toUpperCase().includes(q)));
    $('#tbl').innerHTML = tabla([
      { t: 'Transportista', k: 'transportista_nombre' },
      { t: 'Conductor', f: (u) => esc([u.ap_paterno, u.ap_materno, u.nombre1, u.nombre2].filter(Boolean).join(' ')) },
      { t: 'DNI', k: 'dni' }, { t: 'Brevete', k: 'brevete' }, { t: 'Tracto', f: (u) => `<strong>${esc(u.tracto)}</strong>` }, { t: 'Plataforma', k: 'plataforma' },
      { t: 'Viajes', f: (u) => num(viajesPor.get(u.tracto)?.viajes || 0, 0), n: 1 }, { t: 'TN', f: (u) => num(viajesPor.get(u.tracto)?.tn || 0), n: 1 },
      { t: '', f: (u) => (edit ? `<button class="btn sm" data-u="${u.id}">Editar</button>` : '') },
    ], fil, { empty: us.length ? 'Sin coincidencias' : 'La lista está vacía. Agregue unidades o importe la hoja LISTA.' });
  };
  pintar();
  $('#q').addEventListener('input', (e) => { qU = e.target.value; pintar(); });
  $('#b-new')?.addEventListener('click', () => unidadModal(null, transp, ctx.rerender));
  $('#b-copiar')?.addEventListener('click', () => {
    const otras = state.ops.filter((o) => o.id !== state.opId);
    if (!otras.length) { toast('No hay otras operaciones de las que copiar', true); return; }
    modal({
      title: 'Copiar lista de otra operación',
      submitText: 'Copiar a esta operación',
      body: `<p class="muted" style="margin-top:0">Se copian los transportistas, conductores y unidades de la operación elegida a la LISTA de esta operación.
        Se integra sin duplicar: un conductor que ya está (mismo DNI, o misma placa si no tiene DNI) se actualiza con los datos de la operación de origen.</p>
        <div class="form">
          <label class="full">Copiar desde *<select name="origen_id" required>${otras.map((o) => `<option value="${o.id}">${esc(o.nave)} · Orden ${esc(o.orden)}${o.estado === 'FINALIZADA' ? ' (finalizada)' : ''}</option>`).join('')}</select></label>
          <label class="full">Empresa<select name="transportista_id"><option value="">Todas las empresas</option>${transp.map((t) => `<option value="${t.id}">${esc(t.razon_social)} (${esc(t.nombre_comercial)})</option>`).join('')}</select></label>
          <label class="check full"><input type="checkbox" name="participacion"> Copiar también la participación de transportistas (unidades solicitadas, TN prom. por unidad y vueltas)</label>
        </div>`,
      onSubmit: async (d) => {
        const r = await api(`/operaciones/${state.opId}/copiar-lista`, { method: 'POST', body: d });
        toast(`LISTA copiada: ${r.insertados} nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios`);
        ctx.rerender();
      },
    });
  });
  $('#b-imp-lista')?.addEventListener('click', async () => {
    const dlg = document.createElement('dialog');
    dlg.style.width = 'min(900px, calc(100vw - 32px))';
    dlg.innerHTML = `<div class="dh"><h2>Importar LISTA de transportistas, conductores y unidades</h2><button type="button" class="btn sm" data-close aria-label="Cerrar">✕</button></div>
      <div class="db">${await formularioLista()}</div><div class="df"><button type="button" class="btn" data-close>Cerrar</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { dlg.close(); dlg.remove(); }));
    dlg.addEventListener('cancel', () => dlg.remove());
    dlg.querySelector('[data-lista]').addEventListener('submit', (e) => enviarLista(e, ctx.rerender));
    dlg.showModal();
  });
  $('#tbl').addEventListener('click', (e) => {
    const id = e.target.closest('[data-u]')?.dataset.u;
    if (id) unidadModal(us.find((u) => u.id === Number(id)), transp, ctx.rerender);
  });
}

function unidadModal(u, transp, done) {
  const nuevo = !u; u = u || {};
  const dlg = modal({
    title: nuevo ? 'Nueva unidad' : `Unidad ${u.tracto}`,
    body: `<div class="form">
      <label class="full">Transportista<select name="transportista_id"><option value="">—</option>${transp.map((t) => `<option value="${t.id}" ${t.id === u.transportista_id ? 'selected' : ''}>${esc(t.nombre_comercial)}</option>`).join('')}</select></label>
      <label>Ap. paterno<input name="ap_paterno" value="${esc(u.ap_paterno || '')}"></label>
      <label>Ap. materno<input name="ap_materno" value="${esc(u.ap_materno || '')}"></label>
      <label>1er nombre<input name="nombre1" value="${esc(u.nombre1 || '')}"></label>
      <label>2do nombre<input name="nombre2" value="${esc(u.nombre2 || '')}"></label>
      <label>DNI<input name="dni" maxlength="8" inputmode="numeric" value="${esc(u.dni || '')}"></label>
      <label>Brevete<input name="brevete" value="${esc(u.brevete || '')}"></label>
      <label>Placa tracto *<input name="tracto" required value="${esc(u.tracto || '')}" style="text-transform:uppercase"></label>
      <label>Placa plataforma<input name="plataforma" value="${esc(u.plataforma || '')}" style="text-transform:uppercase"></label>
      ${!nuevo ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar unidad</button></div>' : ''}</div>`,
    onSubmit: async (d) => {
      d.tracto = normPlaca(d.tracto); d.plataforma = normPlaca(d.plataforma);
      if (nuevo) await api(`/operaciones/${state.opId}/unidades`, { method: 'POST', body: d });
      else await api(`/unidades/${u.id}`, { method: 'PUT', body: d });
      toast('Unidad guardada'); done();
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar la unidad ${u.tracto}?`))) return;
    await api(`/unidades/${u.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); done();
  });
}

/* =================== RESÚMENES =================== */
export async function vResumenes(view) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const d = await api(`/operaciones/${state.opId}/tablero`);
  const jTabla = (filas, titulo) => {
    const tot = filas.reduce((a, x) => ({ v: a.v + x.viajes, tn: a.tn + x.tn }), { v: 0, tn: 0 });
    return `<div class="card"><div class="card-h"><h3>${titulo}</h3></div>${tabla([
      { t: 'Día', f: (x) => fecha(x.fecha) }, { t: 'Jornada', k: 'jornada' }, { t: 'Cant. viajes', k: 'viajes', n: 1, d: 0 }, { t: 'TN', k: 'tn', n: 1 },
    ], filas, { foot: ['Total general', '', num(tot.v, 0), num(tot.tn)] })}</div>`;
  };
  const R = state.catalogos.rangos;
  const tt = d.tiempos.reduce((a, x) => { R.forEach((r) => { a[r] = (a[r] || 0) + x[r]; }); a.total = (a.total || 0) + x.total; return a; }, {});
  view.innerHTML = `
    <div class="grid g2">${jTabla(d.jornadas.despacho, 'Despacho de sal por jornada (planta)')}${jTabla(d.jornadas.acopio, 'Acopio de sal por jornada (puerto)')}</div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>Distribución de vueltas por unidad</h3></div><div class="chart-box"><canvas id="ch-vueltas"></canvas></div>
        ${tabla([{ t: '# Vueltas', k: 'vueltas' }, { t: 'Cant. unidades', k: 'cantidad', n: 1, d: 0 }], d.unidades.distribucion, { foot: ['Total', num(d.unidades.unidades.length, 0)] })}</div>
      <div class="card"><div class="card-h"><h3>Viajes por unidad</h3></div>${tabla([
        { t: 'Placa', f: (u) => `<strong>${esc(u.placa)}</strong>` }, { t: 'Transporte', k: 'transportista' }, { t: '# Viajes', k: 'viajes', n: 1, d: 0 }, { t: 'TN', k: 'tn', n: 1 },
      ], d.unidades.unidades)}</div>
    </div>
    <div class="card"><div class="card-h"><h3>Tiempo de atención en puerto (por día de ingreso)</h3></div>${tabla([
      { t: 'Día', f: (x) => fecha(x.dia) }, ...R.map((r) => ({ t: r, k: r, n: 1, d: 0 })), { t: 'Total viajes', k: 'total', n: 1, d: 0 },
    ], d.tiempos, { foot: ['Total', ...R.map((r) => num(tt[r] || 0, 0)), num(tt.total || 0, 0)] })}</div>`;
  const c = colores();
  const dist = [...d.unidades.distribucion].sort((a, b) => a.vueltas - b.vueltas);
  chart($('#ch-vueltas'), {
    type: 'bar',
    data: { labels: dist.map((x) => `${x.vueltas} v.`), datasets: [{ label: 'Unidades', data: dist.map((x) => x.cantidad), backgroundColor: c.serie[2], borderRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

/* =================== PLANIFICACIÓN (PREACOPIO) =================== */
export async function vPlanificacion(view, ctx) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const [op, d] = await Promise.all([api(`/operaciones/${state.opId}`), api(`/operaciones/${state.opId}/tablero`)]);
  const p = d.preacopio;
  const edit = puedeEscribir();
  view.innerHTML = `<div class="grid g3">
    <div class="card"><h3>Tiempo estimado de acopio</h3><div class="table-wrap" style="margin-top:10px"><table><tbody>
      <tr><td>TN total</td><td class="num">${num(p.tn_total, 0)}</td></tr><tr><td>TN por unidad</td><td class="num">${num(p.tn_x_unidad)}</td></tr>
      <tr><td>Viajes total</td><td class="num">${num(p.acopio.viajes_total, 0)}</td></tr><tr><td>Prom. viajes por hora</td><td class="num">${num(p.viajes_x_hora)}</td></tr>
      <tr><td>Horas total</td><td class="num">${horas(p.acopio.horas)}</td></tr><tr><td>Días</td><td class="num">${num(p.acopio.dias)}</td></tr>
      <tr><td>Jornadas total</td><td class="num">${num(p.acopio.jornadas_total, 0)}</td></tr>
      <tr><td>Inicio</td><td class="num">${fechaHora(p.acopio.inicio)}</td></tr><tr><td><strong>Término estimado</strong></td><td class="num"><strong>${fechaHora(p.acopio.termino)}</strong></td></tr>
    </tbody></table></div></div>
    <div class="card"><h3>Tiempo estimado de embarque</h3><div class="table-wrap" style="margin-top:10px"><table><tbody>
      <tr><td>TN total</td><td class="num">${num(p.tn_total, 0)}</td></tr><tr><td>TN por hora</td><td class="num">${num(p.tn_x_hora_embarque, 0)}</td></tr>
      <tr><td>Horas total</td><td class="num">${horas(p.embarque.horas)}</td></tr><tr><td>Días</td><td class="num">${num(p.embarque.dias)}</td></tr>
      <tr><td>Jornadas total</td><td class="num">${num(p.embarque.jornadas_total, 0)}</td></tr>
      <tr><td>Inicio</td><td class="num">${fechaHora(p.embarque.inicio)}</td></tr><tr><td><strong>Término estimado</strong></td><td class="num"><strong>${fechaHora(p.embarque.termino)}</strong></td></tr>
    </tbody></table></div></div>
    <div class="card"><h3>Round trip promedio de unidades</h3><div class="table-wrap" style="margin-top:10px"><table><tbody>
      ${p.round_trip.map((x) => `<tr><td>${esc(x.etapa)}</td><td class="num">${horas((x.min || 0) / 60)}</td></tr>`).join('')}
      <tr><td><strong>Total round trip</strong></td><td class="num"><strong>${horas(p.round_trip_min / 60)}</strong></td></tr>
      <tr><td>Unidades mínimas para el acopio</td><td class="num">${p.unidades_min}</td></tr>
      <tr><td><strong>Unidades necesarias (+50 %)</strong></td><td class="num"><strong>${p.unidades_necesarias}</strong></td></tr>
      <tr><td>Unidades en lista</td><td class="num">${d.unidades_en_lista}</td></tr>
      <tr><td>Unidades participantes</td><td class="num">${d.totales.unidades_activas}</td></tr>
    </tbody></table></div></div>
  </div>
  ${edit ? `<div class="card"><div class="card-h"><h3>Parámetros de planificación</h3></div>
    <form id="f-par" class="form">
      <label>TN por unidad<input name="tn_x_unidad" type="number" step="0.1" value="${p.tn_x_unidad}"></label>
      <label>Prom. viajes por hora<input name="viajes_x_hora" type="number" step="0.1" value="${p.viajes_x_hora}"></label>
      <label>Jornadas por día<input name="jornadas_x_dia" type="number" min="1" value="${p.jornadas_x_dia}"></label>
      <label>TN por hora (embarque)<input name="tn_x_hora_embarque" type="number" value="${p.tn_x_hora_embarque}"></label>
      <label>Inicio acopio<input name="inicio_acopio" type="datetime-local" value="${toInputDT(p.acopio.inicio)}"></label>
      <label>Inicio embarque<input name="inicio_embarque" type="datetime-local" value="${toInputDT(p.embarque.inicio)}"></label>
      <div class="full"><h3 style="margin:6px 0">Round trip (minutos por etapa)</h3></div>
      ${p.round_trip.map((x, i) => `<label>${esc(x.etapa)}<input name="rt_${i}" type="number" min="0" value="${x.min}"></label>`).join('')}
      <div class="full"><button class="btn primary">Guardar parámetros</button></div>
    </form></div>` : ''}`;
  $('#f-par')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const params = {
      ...(JSON.parse(op.params || '{}')),
      tn_x_unidad: Number(f.tn_x_unidad), viajes_x_hora: Number(f.viajes_x_hora), jornadas_x_dia: Number(f.jornadas_x_dia),
      tn_x_hora_embarque: Number(f.tn_x_hora_embarque), inicio_acopio: f.inicio_acopio.replace('T', ' ') || null,
      inicio_embarque: f.inicio_embarque.replace('T', ' ') || null,
      round_trip: p.round_trip.map((x, i) => ({ etapa: x.etapa, min: Number(f[`rt_${i}`]) || 0 })),
    };
    try { await api(`/operaciones/${state.opId}`, { method: 'PUT', body: { params } }); toast('Parámetros guardados'); ctx.rerender(); } catch (err) { toast(err.message, true); }
  });
}

/* =================== REPORTE DE SERVICIO POR TRANSPORTISTA =================== */
export async function vReporteTransportista(view) {
  if (!state.opId) { view.innerHTML = sinOperacion(); return; }
  const parts = await api(`/operaciones/${state.opId}/transportistas`);
  const tid = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('t')) || parts[0]?.transportista_id;
  if (!tid) { view.innerHTML = '<div class="empty card">No hay transportistas en esta operación.</div>'; return; }
  const { op, t, viajes } = await api(`/operaciones/${state.opId}/transportistas/${tid}/reporte`);
  const vs = [...viajes].sort((a, b) => a.nro - b.nro);
  const sum = (k) => vs.reduce((s, v) => s + (Number(v[k]) || 0), 0);
  const fila = (l1, v1, l2, v2) => `<tr><th style="position:static">${l1}</th><td>${v1 ?? '—'}</td><th style="position:static">${l2}</th><td>${v2 ?? '—'}</td></tr>`;
  view.innerHTML = `
    <div class="card no-print"><div class="card-h">
      <label style="min-width:260px">Transportista<select id="sel-t">${parts.map((p) => `<option value="${p.transportista_id}" ${p.transportista_id === tid ? 'selected' : ''}>${esc(p.nombre_comercial)}</option>`).join('')}</select></label>
      <div class="btns"><a class="btn" href="#/transportistas">← Transportistas</a><button class="btn" id="b-xls">Excel</button><button class="btn primary" id="b-pdf">PDF</button></div>
    </div></div>
    <div class="card">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:2px solid var(--primary);padding-bottom:10px;margin-bottom:12px">
        <img src="img/logo.png" alt="" width="90" height="51" style="border-radius:4px">
        <div><div style="font-weight:800;font-size:17px;color:var(--primary)">${esc((op.empresa || '').trim())}</div><div style="font-weight:700">REPORTE DE SERVICIO TRANSPORTE</div></div>
      </div>
      <div class="table-wrap" style="max-height:none"><table class="info"><tbody>
        ${fila('Vapor', esc(op.nave), 'Cliente', esc(op.cliente))}
        ${fila('Producto', esc(op.producto), 'DAM', esc(op.dam))}
        ${fila('Fecha inicio', fechaHoraOpc(op.fecha_inicio), 'Referencia', esc(op.referencia))}
        ${fila('Punto salida', esc(op.punto_salida), 'Total viajes', num(vs.length, 0))}
        ${fila('Punto llegada', esc(op.punto_llegada), 'Total peso TM Huacho', num(sum('peso_origen')))}
        ${fila('Empresa de transporte', esc(t.razon_social), 'RUC', esc(t.ruc))}
        ${fila(esc(t.nombre_comercial), `Contacto: ${esc(t.contacto || '—')} · Tel.: ${esc(t.telefono || '—')}${t.emails ? ` · ${esc(t.emails)}` : ''}`, 'Total peso TM CSPCP', `<strong>${num(sum('peso_destino_calc'))}</strong>`)}
      </tbody></table></div>
      <div style="margin-top:14px">${tabla([
        { t: 'Día despacho', f: (v) => fecha(v.fecha_despacho) }, { t: 'Jornada despacho', k: 'jornada_despacho' }, { t: 'Nro. viaje', k: 'nro' },
        { t: 'Transporte', k: 'transportista_nombre' }, { t: 'Placa', k: 'placa' }, { t: 'Guía R.', k: 'guia' }, { t: 'Peso x unid Huacho', k: 'peso_origen', n: 1 },
        { t: 'Ticket CSPCP', k: 'ticket' }, { t: 'Peso x unid CSPCP', k: 'peso_destino_calc', n: 1 },
      ], vs, { empty: 'Sin viajes', foot: ['Total', '', num(vs.length, 0), '', '', '', num(sum('peso_origen')), '', num(sum('peso_destino_calc'))] })}</div>
      <div class="grid g2" style="margin-top:28px">
        <div><strong>** CONFORMIDAD ACEPTADA **</strong><br>FECHA:<br>APROBADO: ${esc((op.coordinador || '').toUpperCase())}</div>
        <div style="text-align:center;border-top:1px solid var(--text);padding-top:6px;max-width:300px;justify-self:end;width:100%"><strong>${esc(op.coordinador || '')}</strong><br>Coordinador de Transporte<br>${esc((op.empresa || '').trim())}</div>
      </div>
    </div>`;
  $('#sel-t').addEventListener('change', (e) => { location.hash = `#/reporte-transportista?t=${e.target.value}`; });
  $('#b-xls').onclick = () => descargar(`/api/operaciones/${state.opId}/exportar/transportista/${tid}`);
  $('#b-pdf').onclick = () => descargar(`/api/operaciones/${state.opId}/exportar/transportista-pdf/${tid}`);
}
