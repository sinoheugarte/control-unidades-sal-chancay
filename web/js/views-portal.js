// Portal del transportista: sólo ve y descarga sus propios viajes y unidades.
import { state, api, esc, num, fecha, statusPill, $, tabla, descargar } from './core.js?v=__V__';

let opPortal = null;
async function cabecera(view, titulo) {
  const ops = await api('/portal/operaciones');
  if (!ops.length) {
    view.innerHTML = `<div class="card empty"><h2>Aún no hay operaciones disponibles</h2>
      <p>Cuando ${esc(state.user.transportista?.razon_social || 'su empresa')} tenga viajes registrados en una operación, aparecerán aquí.</p></div>`;
    return null;
  }
  if (!ops.some((o) => o.id === opPortal)) opPortal = ops[0].id;
  view.innerHTML = `<div class="card no-print"><div class="card-h">
      <div><h2>${esc(titulo)}</h2><div class="muted small">${esc(state.user.transportista?.razon_social || '')} · RUC ${esc(state.user.transportista?.ruc || '')}</div></div>
      <label style="min-width:320px">Operación<select id="sel-op">${ops.map((o) => `<option value="${o.id}" ${o.id === opPortal ? 'selected' : ''}>${esc(o.nave)} · Orden ${esc(o.orden)} (${o.viajes} viajes)</option>`).join('')}</select></label>
    </div></div><div id="portal-body" style="min-width:0;display:grid;gap:18px"><div class="empty">Cargando…</div></div>`;
  return { ops, body: $('#portal-body', view) };
}

export async function vPortal(view, ctx) {
  const c = await cabecera(view, 'Mis viajes');
  if (!c) return;
  $('#sel-op').addEventListener('change', (e) => { opPortal = Number(e.target.value); ctx.rerender(); });
  const v = await api(`/portal/op/${opPortal}`);
  const vs = [...v.viajes].sort((a, b) => a.nro - b.nro);
  const sum = (k) => vs.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const op = v.operacion;
  c.body.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Viajes</div><div class="v">${num(vs.length, 0)}</div></div>
      <div class="kpi"><div class="l">TN despachadas (Huacho)</div><div class="v">${num(sum('peso_origen'))}</div></div>
      <div class="kpi"><div class="l">TN recibidas (CSPCP)</div><div class="v">${num(vs.filter((x) => x.status === 'DESCARGADO').reduce((s, x) => s + (Number(x.peso_destino_calc) || 0), 0))}</div><div class="s">sólo viajes descargados</div></div>
      <div class="kpi"><div class="l">Por descargar</div><div class="v">${num(vs.filter((x) => x.status === 'FALTA DESCARGAR').length, 0)}</div></div>
      <div class="kpi"><div class="l">Unidades</div><div class="v">${num(new Set(vs.map((x) => x.placa)).size, 0)}</div><div class="s">${v.unidades.length} en lista</div></div>
    </div>
    <div class="card">
      <div class="card-h"><div><h3>REPORTE DE SERVICIO TRANSPORTE</h3>
        <div class="muted small">${esc(op.nave)} · Orden ${esc(op.orden)} · ${esc(op.cliente || '')} · ${esc(op.punto_salida || '')} → ${esc(op.punto_llegada || '')} · DAM ${esc(op.dam || '—')}</div></div>
        <div class="btns"><button class="btn" id="b-xls">Descargar Excel</button><button class="btn primary" id="b-pdf">Descargar PDF</button></div></div>
      ${tabla([
        { t: 'Día despacho', f: (x) => fecha(x.fecha_despacho) }, { t: 'Jornada despacho', k: 'jornada_despacho' }, { t: 'Nro. viaje', k: 'nro' },
        { t: 'Transporte', k: 'transportista_nombre' }, { t: 'Placa', f: (x) => `<strong>${esc(x.placa)}</strong>` }, { t: 'Guía R.', k: 'guia' },
        { t: 'Peso x unid Huacho', k: 'peso_origen', n: 1 }, { t: 'Ticket CSPCP', k: 'ticket' }, { t: 'Peso x unid CSPCP', k: 'peso_destino_calc', n: 1 },
        { t: 'Status', f: (x) => statusPill(x.status) },
      ], vs, { empty: 'Sin viajes en esta operación', foot: ['Total', '', num(vs.length, 0), '', '', '', num(sum('peso_origen')), '', num(sum('peso_destino_calc')), ''] })}
    </div>`;
  $('#b-xls').onclick = () => descargar(`/api/portal/op/${opPortal}/exportar/reporte-xlsx`);
  $('#b-pdf').onclick = () => descargar(`/api/portal/op/${opPortal}/exportar/reporte-pdf`);
}

export async function vPortalUnidades(view, ctx) {
  const c = await cabecera(view, 'Mis unidades');
  if (!c) return;
  $('#sel-op').addEventListener('change', (e) => { opPortal = Number(e.target.value); ctx.rerender(); });
  const v = await api(`/portal/op/${opPortal}`);
  const viajesPor = new Map();
  for (const x of v.viajes) viajesPor.set(x.placa, (viajesPor.get(x.placa) || 0) + 1);
  c.body.innerHTML = `<div class="card"><div class="card-h"><h3>Lista de unidades y conductores</h3>
      <div class="btns"><button class="btn" id="b-xls">Descargar Excel</button><button class="btn primary" id="b-pdf">Descargar PDF</button></div></div>
    ${tabla([
      { t: 'Conductor', f: (u) => esc([u.ap_paterno, u.ap_materno, u.nombre1, u.nombre2].filter(Boolean).join(' ')) },
      { t: 'DNI', k: 'dni' }, { t: 'Brevete', k: 'brevete' }, { t: 'Tracto', f: (u) => `<strong>${esc(u.tracto)}</strong>` }, { t: 'Plataforma', k: 'plataforma' },
      { t: 'Viajes', n: 1, f: (u) => num(viajesPor.get(u.tracto) || 0, 0) },
    ], v.unidades, { empty: 'No hay unidades registradas para su empresa en esta operación' })}</div>`;
  $('#b-xls').onclick = () => descargar(`/api/portal/op/${opPortal}/exportar/unidades-xlsx`);
  $('#b-pdf').onclick = () => descargar(`/api/portal/op/${opPortal}/exportar/unidades-pdf`);
}
