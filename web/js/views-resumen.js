// RESUMEN ANUAL de operaciones (como el libro "RESUMEN DE OPERACIONES ACOPIO DE SAL … <AÑO>").
import { state, api, esc, num, fecha, toast, $, $$, tabla, chart, colores, descargarBlob } from './core.js?v=__V__';
import { exportarResumenAnual } from './excel.js?v=__V__';
import { pdfResumenAnual } from './pdf.js?v=__V__';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const f = { anio: null, q: '', estado: '', cliente: '', transp: '', abiertas: new Set() };
const estadoDe = (o) => (o.estado === 'CERRADA' ? 'FINALIZADA' : o.estado || 'EN CURSO');

/** Filas del cuadro por transportista de una operación (filtradas por transportista si corresponde). */
const filasT = (o) => (o.resumen?.transportistas || []).filter((t) => !f.transp || t.ruc === f.transp);
/** Totales de la operación según el filtro de transportista. */
function totalesOp(o) {
  if (!f.transp) return { tn_acopio: o.resumen?.tn_acopio || 0, tn_despacho: o.resumen?.tn_despacho || 0, viajes: o.resumen?.viajes || 0 };
  const ts = filasT(o);
  return { tn_acopio: ts.reduce((s, t) => s + (t.tn_cspcp || 0), 0), tn_despacho: ts.reduce((s, t) => s + (t.tn_huacho || 0), 0), viajes: ts.reduce((s, t) => s + (t.viajes_realizados || 0), 0) };
}

export async function vResumenAnual(view, ctx) {
  const todas = await api('/resumen-anual');
  const anios = [...new Set(todas.map((o) => o.anio_calc).filter(Boolean))].sort((a, b) => b - a);
  if (!anios.length) {
    view.innerHTML = `<div class="card empty"><h2>Aún no hay operaciones</h2><p>El resumen se arma solo con las operaciones de la app (cuadro de transportistas calculado con REPORTE HUACHO y REPORTE CSPCP).</p>
      <a class="btn primary" href="#/operaciones">Ir a Operaciones</a></div>`;
    return;
  }
  if (!anios.includes(f.anio)) f.anio = anios[0];
  const delAnio = todas.filter((o) => o.anio_calc === f.anio);
  const clientes = [...new Set(delAnio.map((o) => o.cliente).filter(Boolean))].sort();
  const transps = new Map();
  delAnio.forEach((o) => filasTodas(o).forEach((t) => { if (t.ruc && (t.viajes_realizados || t.tn_cspcp)) transps.set(t.ruc, t.razon_social); }));

  view.innerHTML = `
    <div class="card"><div class="card-h">
      <div><h2>Resumen de operaciones acopio de sal · Chancay</h2><div class="muted small">Todas las naves del año. Haga clic en una nave o en los gráficos para ver el detalle.</div></div>
      <div class="btns">
        <span class="muted small">Completo (resumen + cuadro por nave):</span>
        <button class="btn" id="b-xls">Excel</button><button class="btn" id="b-pdf">PDF</button>
      </div></div>
      <div class="tabs" role="tablist" style="margin-bottom:12px">${anios.map((a) => `<button role="tab" data-anio="${a}" class="${a === f.anio ? 'active' : ''}" aria-selected="${a === f.anio}">${a}</button>`).join('')}</div>
      <div class="btns">
        <input id="r-q" type="search" placeholder="Buscar nave u orden…" value="${esc(f.q)}" style="width:min(260px,100%)" aria-label="Buscar nave">
        <select id="r-cli" aria-label="Cliente"><option value="">Todos los clientes</option>${clientes.map((c) => `<option ${c === f.cliente ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="r-tra" aria-label="Transportista"><option value="">Todos los transportistas</option>${[...transps].sort((a, b) => a[1].localeCompare(b[1])).map(([ruc, rs]) => `<option value="${esc(ruc)}" ${ruc === f.transp ? 'selected' : ''}>${esc(rs)}</option>`).join('')}</select>
        <select id="r-est" aria-label="Estado"><option value="">Todos los estados</option>${['EN CURSO', 'FINALIZADA'].map((e) => `<option ${e === f.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>
        <button class="btn sm" id="r-limpiar">Limpiar filtros</button>
      </div>
    </div>
    <div id="r-body" style="display:grid;gap:18px;min-width:0"></div>`;

  const pintar = () => {
    const q = f.q.trim().toUpperCase();
    const ops = delAnio
      .filter((o) => (!q || `${o.nave} ${o.orden}`.toUpperCase().includes(q)) && (!f.cliente || o.cliente === f.cliente)
        && (!f.estado || estadoDe(o) === f.estado) && (!f.transp || filasT(o).some((t) => t.viajes_realizados || t.tn_cspcp)))
      .sort((a, b) => String(a.resumen?.inicio_acopio || a.fecha_inicio || '9999').localeCompare(String(b.resumen?.inicio_acopio || b.fecha_inicio || '9999')) || a.id - b.id);
    const tot = ops.map(totalesOp);
    const sum = (k) => tot.reduce((s, x) => s + (x[k] || 0), 0);
    const nT = new Set(ops.flatMap((o) => filasT(o).filter((t) => t.viajes_realizados || t.tn_cspcp).map((t) => t.ruc))).size;
    const body = $('#r-body');
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Operaciones</div><div class="v">${ops.length}</div><div class="s">${ops.filter((o) => estadoDe(o) === 'FINALIZADA').length} finalizadas</div></div>
        <div class="kpi"><div class="l">TN sal acopiada (CSPCP)</div><div class="v">${num(sum('tn_acopio'))}</div></div>
        <div class="kpi"><div class="l">TN despachada (Huacho)</div><div class="v">${num(sum('tn_despacho'))}</div></div>
        <div class="kpi"><div class="l">Viajes realizados</div><div class="v">${num(sum('viajes'), 0)}</div></div>
        <div class="kpi"><div class="l">Promedio por nave</div><div class="v">${num(ops.length ? sum('tn_acopio') / ops.length : 0)}</div><div class="s">TN acopiadas</div></div>
        <div class="kpi"><div class="l">Transportistas</div><div class="v">${nT}</div><div class="s">con viajes en ${f.anio}</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>TN acopiada por nave</h3><span class="muted small">clic para ver el detalle</span></div><div class="chart-box"><canvas id="c-nave"></canvas></div></div>
        <div class="card"><div class="card-h"><h3>TN acopiada por mes</h3><span class="muted small">según inicio de acopio</span></div><div class="chart-box"><canvas id="c-mes"></canvas></div></div>
        <div class="card"><div class="card-h"><h3>Participación por transportista</h3><span class="muted small">clic para filtrar</span></div><div class="chart-box"><canvas id="c-tra"></canvas></div></div>
        <div class="card"><div class="card-h"><h3>Transportistas por nave</h3><span class="muted small">TN final CSPCP</span></div><div class="chart-box"><canvas id="c-mat"></canvas></div></div>
      </div>
      <div class="card"><div class="card-h"><div><h3>RESUMEN ${f.anio}${f.transp ? ` · ${esc(transps.get(f.transp) || '')}` : ''}</h3>
        <div class="muted small">Tabla resumen como en el libro. Despliegue una nave (▸) para ver su cuadro de transportistas.</div></div>
        <div class="btns"><span class="muted small">Tabla resumen:</span><button class="btn sm primary" id="t-xls">Excel</button><button class="btn sm primary" id="t-pdf">PDF</button>
          <button class="btn sm" id="r-exp">Expandir todo</button><button class="btn sm" id="r-col">Contraer todo</button></div></div>
        <div class="table-wrap" style="max-height:none"><table>
          <thead><tr><th class="no-print"></th><th>N°</th><th>NAVE</th><th>FECHA INICIO ACOPIO</th><th>FECHA FINAL ACOPIO</th><th class="num">TN SAL ACOPIADA</th><th class="no-print"></th></tr></thead>
          <tbody>${ops.map((o, i) => filaOp(o, i, tot[i])).join('') || '<tr><td colspan="7" class="empty">Ninguna operación coincide con los filtros</td></tr>'}</tbody>
          <tfoot><tr><td class="no-print"></td><td></td><td>TOTAL</td><td></td><td></td><td class="num">${num(sum('tn_acopio'))}</td><td class="no-print"></td></tr></tfoot>
        </table></div></div>`;
    graficos(ops, tot);
    $('#r-exp').onclick = () => { ops.forEach((o) => f.abiertas.add(o.id)); pintar(); };
    $('#r-col').onclick = () => { f.abiertas.clear(); pintar(); };
    body._ops = ops;
  };

  const colsT = [
    { t: 'Razón social', f: (t) => `<strong>${esc(t.razon_social)}</strong>` }, { t: 'RUC', k: 'ruc' },
    { t: 'Unidades solicitadas', k: 'unidades_solicitadas', n: 1, d: 0 }, { t: 'TN prom. x unidad', k: 'tn_prom_unidad', n: 1 },
    { t: 'Viajes aprox.', k: 'viajes_aprox', n: 1, d: 0 }, { t: 'Total aprox. TN', k: 'tn_aprox', n: 1, d: 0 },
    { t: 'Viajes realizados', k: 'viajes_realizados', n: 1, d: 0 }, { t: 'Total final TN Huacho', k: 'tn_huacho', n: 1 },
    { t: 'Total final TN CSPCP', k: 'tn_cspcp', n: 1 }, { t: 'Observación', f: (t) => esc(t.observacion || '') },
  ];
  function filaOp(o, i, t) {
    const ab = f.abiertas.has(o.id);
    const ts = filasT(o);
    const s = (k) => ts.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    return `<tr data-fila="${o.id}" style="cursor:pointer" title="${esc(`Orden ${o.orden} · ${estadoDe(o)} · ${t.viajes} viajes`)}">
        <td class="no-print"><button class="btn sm" data-tog="${o.id}" aria-expanded="${ab}" aria-label="Ver transportistas de ${esc(o.nave)}">${ab ? '▾' : '▸'}</button></td>
        <td>${i + 1}</td><td><strong>${esc(o.nave)}</strong></td>
        <td>${fecha(o.resumen?.inicio_acopio)}</td><td>${fecha(o.resumen?.fin_acopio)}</td>
        <td class="num"><strong>${num(t.tn_acopio)}</strong></td>
        <td class="no-print">${o.origen === 'resumen' ? '' : `<button class="btn sm" data-abrir="${o.id}">Abrir</button>`}</td></tr>
      ${ab ? `<tr><td></td><td colspan="6" style="white-space:normal;background:var(--surface-2)">
        <div class="muted small" style="margin-bottom:6px">Orden ${esc(o.orden)} · ${esc(estadoDe(o))} · ${num(t.viajes, 0)} viajes</div>
        ${tabla(colsT, ts, { empty: 'Sin cuadro de transportistas', foot: ['TOTAL', String(ts.filter((x) => x.ruc).length), num(s('unidades_solicitadas'), 0), '-', num(s('viajes_aprox'), 0), num(s('tn_aprox'), 0), num(s('viajes_realizados'), 0), num(s('tn_huacho')), num(s('tn_cspcp')), ''] })}
      </td></tr>` : ''}`;
  }

  function graficos(ops, tot) {
    const c = colores();
    const ch1 = chart($('#c-nave'), {
      type: 'bar',
      data: { labels: ops.map((o) => o.nave), datasets: [{ label: 'TN acopiada', data: tot.map((t) => t.tn_acopio), backgroundColor: c.serie[0], borderRadius: 4 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${num(x.raw)} TN` } } }, scales: { y: { beginAtZero: true } },
        onClick: (e, els) => { if (els[0]) { const o = ops[els[0].index]; f.abiertas.add(o.id); pintar(); document.querySelector(`[data-fila="${o.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } },
    });
    const porMes = Array(12).fill(0);
    ops.forEach((o, i) => { const m = Number(String(o.resumen?.inicio_acopio || '').slice(5, 7)); if (m) porMes[m - 1] += tot[i].tn_acopio; });
    chart($('#c-mes'), {
      type: 'bar',
      data: { labels: MESES, datasets: [{ label: 'TN', data: porMes, backgroundColor: c.serie[2], borderRadius: 4 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${num(x.raw)} TN` } } }, scales: { y: { beginAtZero: true } } },
    });
    const porT = new Map();
    ops.forEach((o) => filasT(o).forEach((t) => { if (!t.tn_cspcp) return; const e = porT.get(t.ruc) || { rs: t.razon_social, tn: 0 }; e.tn += t.tn_cspcp; porT.set(t.ruc, e); }));
    const lt = [...porT.entries()].sort((a, b) => b[1].tn - a[1].tn);
    const totT = lt.reduce((s, x) => s + x[1].tn, 0) || 1;
    chart($('#c-tra'), {
      type: 'bar',
      data: { labels: lt.map((x) => x[1].rs), datasets: [{ label: 'TN', data: lt.map((x) => x[1].tn), backgroundColor: lt.map(([ruc]) => (f.transp && ruc !== f.transp ? c.grid : c.serie[1])), borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${num(x.raw)} TN · ${num((x.raw / totT) * 100, 1)} %` } } },
        onClick: (e, els) => { if (els[0]) { const ruc = lt[els[0].index][0]; f.transp = f.transp === ruc ? '' : ruc; ctx.rerender(); } } },
    });
    const rucs = lt.map((x) => x[0]);
    chart($('#c-mat'), {
      type: 'bar',
      data: {
        labels: ops.map((o) => o.nave),
        datasets: rucs.map((ruc, i) => ({ label: porT.get(ruc).rs, backgroundColor: c.serie[i % c.serie.length],
          data: ops.map((o) => (o.resumen?.transportistas || []).find((t) => t.ruc === ruc)?.tn_cspcp || 0) })),
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
    });
    void ch1;
  }

  pintar();
  $$('[data-anio]').forEach((b) => b.addEventListener('click', () => { f.anio = Number(b.dataset.anio); f.abiertas.clear(); f.cliente = ''; f.transp = ''; ctx.rerender(); }));
  $('#r-q').addEventListener('input', (e) => { f.q = e.target.value; pintar(); });
  $('#r-cli').addEventListener('change', (e) => { f.cliente = e.target.value; pintar(); });
  $('#r-tra').addEventListener('change', (e) => { f.transp = e.target.value; ctx.rerender(); });
  $('#r-est').addEventListener('change', (e) => { f.estado = e.target.value; pintar(); });
  $('#r-limpiar').addEventListener('click', () => { Object.assign(f, { q: '', estado: '', cliente: '', transp: '' }); f.abiertas.clear(); ctx.rerender(); });
  $('#r-body').addEventListener('click', (e) => {
    const ab = e.target.closest('[data-abrir]')?.dataset.abrir;
    if (ab) { e.stopPropagation(); window.dispatchEvent(new CustomEvent('app:ops', { detail: { id: Number(ab), render: false, luego: () => { location.hash = '#/tablero'; } } })); return; }
    const fila = e.target.closest('[data-tog], [data-fila]');
    if (!fila) return;
    const id = Number(fila.dataset.tog || fila.dataset.fila);
    if (f.abiertas.has(id)) f.abiertas.delete(id); else f.abiertas.add(id);
    pintar();
  });
  const opsVisibles = () => $('#r-body')._ops || [];
  const datosExport = () => opsVisibles().map((o) => ({ ...o, tot: totalesOp(o), filas: filasT(o) }));
  const nombreArch = (sufijo, ext) => `RESUMEN DE OPERACIONES ACOPIO DE SAL CHANCAY ${f.anio}${sufijo}.${ext}`;
  const empresa = () => state.ops[0]?.empresa;
  $('#b-xls').onclick = async () => { toast('Generando Excel…'); descargarBlob(await exportarResumenAnual(f.anio, datosExport()), nombreArch('', 'xlsx')); };
  $('#b-pdf').onclick = async () => { toast('Generando PDF…'); descargarBlob(await pdfResumenAnual(f.anio, datosExport(), empresa()), nombreArch('', 'pdf')); };
  view.addEventListener('click', async (e) => {
    if (e.target.id === 't-xls') { toast('Generando Excel…'); descargarBlob(await exportarResumenAnual(f.anio, datosExport(), { soloTabla: true }), nombreArch(' - TABLA RESUMEN', 'xlsx')); }
    if (e.target.id === 't-pdf') { toast('Generando PDF…'); descargarBlob(await pdfResumenAnual(f.anio, datosExport(), empresa(), { soloTabla: true }), nombreArch(' - TABLA RESUMEN', 'pdf')); }
  });
}
const filasTodas = (o) => o.resumen?.transportistas || [];
