import { state, api, esc, num, fecha, fechaHora, fechaHoraOpc, toInputDT, toast, $, modal, confirmar, tabla, puedeEscribir, esAdmin, sinOperacion, opActual } from './core.js?v=__V__';

const refrescar = (id, render = true, luego) => window.dispatchEvent(new CustomEvent('app:ops', { detail: { id, render, luego } }));

/* =================== OPERACIONES (búsqueda) =================== */
const filtroOps = { q: '', estado: '', anio: '' };
const anioDe = (o) => String(o.fecha_inicio || o.primer_viaje || o.eta || o.actualizado_en || '').slice(0, 4);
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export async function vOperaciones(view, ctx) {
  const ops = await api('/operaciones');
  const edit = puedeEscribir();
  const anios = [...new Set(ops.map(anioDe).filter(Boolean))].sort().reverse();
  view.innerHTML = `<div class="card"><div class="card-h"><div><h2>Operaciones (nave / orden)</h2>
      <p class="muted small" style="margin:4px 0 0">Cada operación es un reporte independiente, como cada libro Excel, guardado en SharePoint con el nombre del reporte. Búsquela para abrirla o editarla; para una nave nueva use <strong>+ Nueva operación</strong>.</p></div>
      ${edit ? '<div class="btns"><a class="btn" href="#/importar">Importar libro Excel</a><button class="btn primary" id="b-new">+ Nueva operación</button></div>' : ''}</div>
    <div class="btns" style="margin-bottom:12px">
      <input id="op-q" type="search" placeholder="Buscar nave, orden, cliente, DAM, referencia…" value="${esc(filtroOps.q)}" style="width:min(360px,100%)" aria-label="Buscar operación">
      <select id="op-estado" aria-label="Estado"><option value="">Todos los estados</option><option>EN CURSO</option><option>FINALIZADA</option></select>
      <select id="op-anio" aria-label="Año"><option value="">Todos los años</option>${anios.map((a) => `<option>${a}</option>`).join('')}</select>
      <span class="muted small" id="op-n"></span>
    </div>
    <div id="op-tbl"></div></div>`;
  $('#op-estado').value = filtroOps.estado; $('#op-anio').value = filtroOps.anio;
  const pintar = () => {
    const q = sinTildes(filtroOps.q).trim();
    const fil = ops.filter((o) => (!q || q.split(/\s+/).every((t) => sinTildes([o.nombre, o.nave, o.orden, o.cliente, o.producto, o.dam, o.manifiesto, o.referencia].join(' ')).includes(t)))
      && (!filtroOps.estado || (o.estado === 'CERRADA' ? 'FINALIZADA' : o.estado || 'EN CURSO') === filtroOps.estado) && (!filtroOps.anio || anioDe(o) === filtroOps.anio));
    $('#op-n').textContent = `${fil.length} de ${ops.length} operaciones`;
    $('#op-tbl').innerHTML = tabla([
      { t: 'Reporte', f: (o) => `<a href="#" data-abrir="${o.id}"><strong>${esc(o.nombre || `${o.nave} - ORDEN ${o.orden}`)}</strong></a>${o.id === state.opId ? ' <span class="pill info">activa</span>' : ''}` },
      { t: '', f: (o) => `<div class="btns" style="flex-wrap:nowrap"><button class="btn sm primary" data-abrir="${o.id}">Abrir</button>
        ${edit ? `<button class="btn sm" data-op="${o.id}">Editar</button>` : ''}</div>` },
      { t: 'Cliente', k: 'cliente' }, { t: 'DAM', k: 'dam' },
      { t: 'ETA', f: (o) => fechaHora(o.eta) }, { t: 'Inicio', f: (o) => (o.fecha_inicio ? fechaHoraOpc(o.fecha_inicio) : fecha(o.primer_viaje)) }, { t: 'Último viaje', f: (o) => fecha(o.ultimo_viaje) },
      { t: 'TN prog.', k: 'tn_programadas', n: 1, d: 0 }, { t: 'Viajes', k: 'n_viajes', n: 1, d: 0 },
      { t: 'Estado', f: (o) => `<span class="pill ${['CERRADA', 'FINALIZADA'].includes(o.estado) ? 'ok' : 'info'}">${esc(o.estado === 'CERRADA' ? 'FINALIZADA' : o.estado || 'EN CURSO')}</span>` },
      { t: 'Modificado', f: (o) => (o.actualizado_en ? `${fechaHora(o.actualizado_en)}<div class="muted small">${esc(o.actualizado_por || '')}</div>` : '—') },
    ], fil, { empty: ops.length ? 'Ninguna operación coincide con la búsqueda' : 'No hay operaciones. Cree una nueva o importe el libro Excel del reporte.' });
  };
  pintar();
  $('#op-q').addEventListener('input', (e) => { filtroOps.q = e.target.value; pintar(); });
  $('#op-estado').addEventListener('change', (e) => { filtroOps.estado = e.target.value; pintar(); });
  $('#op-anio').addEventListener('change', (e) => { filtroOps.anio = e.target.value; pintar(); });
  $('#op-q').focus();
  $('#b-new')?.addEventListener('click', () => opModal(null));
  view.addEventListener('click', async (e) => {
    const ab = e.target.closest('[data-abrir]')?.dataset.abrir;
    if (ab) { e.preventDefault(); refrescar(Number(ab), false, () => { location.hash = '#/tablero'; }); return; }
    const id = e.target.closest('[data-op]')?.dataset.op;
    if (id) {
      // Cargar la operación completa (el listado sólo tiene un resumen) antes de editar
      try { opModal(await api(`/operaciones/${id}`), () => ctx?.rerender()); } catch (err) { toast(err.message, true); }
    }
  });
}

function opModal(o, despues) {
  const nuevo = !o; o = o || { empresa: 'PACIFICO DESPACHOS S.A.C.', estado: 'EN CURSO' };
  const f = (k, l, type = 'text', extra = '') => `<label>${l}<input name="${k}" type="${type}" value="${esc(type === 'datetime-local' ? toInputDT(o[k]) : o[k] ?? '')}" ${extra}></label>`;
  const dlg = modal({
    title: nuevo ? 'Nueva operación' : `${o.nave} · Orden ${o.orden}`,
    wide: true,
    body: `<div class="form">
      ${f('nave', 'Nave *', 'text', 'required')}${f('orden', 'Orden *', 'text', 'required')}${f('manifiesto', 'Manifiesto')}${f('dam', 'DAM')}
      ${f('eta', 'ETA', 'datetime-local')}${f('fecha_inicio', 'Fecha y hora de inicio (tentativa)', 'datetime-local')}${f('cliente', 'Cliente')}${f('producto', 'Producto')}
      ${f('referencia', 'Referencia')}${f('punto_salida', 'Punto de salida')}${f('punto_llegada', 'Punto de llegada')}${f('empresa', 'Empresa')}
      ${f('coordinador', 'Coordinador de transporte')}
      ${f('tn_programadas', 'TN programadas *', 'number', 'step="0.01" min="0" required')}
      ${f('tn_embarque_programadas', 'TN programadas embarque', 'number', 'step="0.01" min="0"')}
      ${f('tn_draft_sgs', 'TN embarcadas draft SGS', 'number', 'step="0.01" min="0"')}
      <label>Estado<select name="estado">${['EN CURSO', 'FINALIZADA'].map((s) => `<option ${s === (o.estado === 'CERRADA' ? 'FINALIZADA' : o.estado) ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${!nuevo && esAdmin() ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar operación y todos sus datos</button></div>' : ''}
    </div>`,
    onSubmit: async (d) => {
      const r = nuevo ? await api('/operaciones', { method: 'POST', body: d }) : await api(`/operaciones/${o.id}`, { method: 'PUT', body: d });
      toast('Operación guardada');
      if (nuevo) refrescar(r.id); else { refrescar(state.opId, !despues); despues?.(); }
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`Se eliminará la operación ${o.nave} - ORDEN ${o.orden} con todos sus viajes, tickets, unidades y reportes. ¿Continuar?`))) return;
    await api(`/operaciones/${o.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); toast('Operación eliminada'); refrescar();
  });
}

/* =================== IMPORTAR =================== */
let ultimoResultado = null; // { tipo, html } para mostrarlo tras recargar la pantalla
export async function vImportar(view, ctx) {
  if (!puedeEscribir()) { view.innerHTML = '<div class="alert">Su usuario es de sólo lectura.</div>'; return; }
  const op = opActual();
  const cr = op ? await api(`/operaciones/${state.opId}/cruce`) : null;
  const ct = op ? await api(`/operaciones/${state.opId}/cortes`) : null;
  // Formulario de REPORTE HUACHO / CSPCP: exige la fecha y hora de cierre del corte
  const formCorte = (id, proceso) => {
    const c = ct[proceso];
    const quien = proceso === 'despacho' ? 'despacho de la 1ra unidad (se toma del REPORTE HUACHO)' : 'ingreso al puerto de la 1ra unidad (se toma del REPORTE CSPCP)';
    return `<form class="form" data-imp="${id}" data-proceso="${proceso}" style="margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      <label class="full">Archivo *<input type="file" name="archivo" accept=".xlsx,.xlsm,.xls,.csv" required aria-label="Archivo"></label>
      <label>Corte<select name="modo">
        <option value="nuevo">Nuevo: ${c.siguiente}° reporte de ${proceso}</option>
        ${c.ultimo ? `<option value="actualizar">Actualizar el ${c.ultimo.numero}° reporte (corrección)</option>` : ''}</select></label>
      <label>Fecha y hora de cierre del reporte *<input type="datetime-local" name="cierre" required></label>
      <p class="full muted small" style="margin:0" data-inicio>Inicio del ${c.siguiente}° reporte: <strong>${c.inicio_siguiente ? `${fechaHora(c.inicio_siguiente)} (cierre del ${c.siguiente - 1}° reporte)` : `hora de ${quien}`}</strong>${!c.inicio_siguiente && c.primera ? ` · actualmente ${fechaHora(c.primera)}` : ''}</p>
      <div class="full"><button class="btn primary">Importar</button></div></form><div class="small" data-res="${id}" style="margin-top:10px"></div>`;
  };
  const ultima = (u) => (u ? `<p class="muted small" style="margin:6px 0 0">Última carga: <strong>${esc(fechaHora(u.en))}</strong> por ${esc(u.por)} · ${esc(u.archivo)}</p>` : '<p class="muted small" style="margin:6px 0 0">Aún no se ha cargado.</p>');
  const form = (id) => `<form class="btns" data-imp="${id}" style="margin-top:12px">
      <input type="file" name="archivo" accept=".xlsx,.xlsm,.xls,.csv" required style="max-width:340px" aria-label="Archivo">
      <button class="btn primary">Importar</button></form><div class="small" data-res="${id}" style="margin-top:10px"></div>`;
  view.innerHTML = !op ? `<div class="card"><h2>Primero cree la operación</h2>
      <p class="muted">Los reportes (REPORTE HUACHO, REPORTE CSPCP) y la LISTA se importan dentro de una operación (nave + orden). Créela y vuelva a esta pantalla.</p>
      <a class="btn primary" href="#/operaciones">+ Nueva operación</a></div>` : `
    <div class="alert ok">Operación activa: <strong>${esc(op.nave)} · Orden ${esc(op.orden)}</strong></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>REPORTE HUACHO</h2><span class="pill info">${num(cr.con_guia, 0)} guías</span></div>
        <p class="muted" style="margin:0">Despachos de planta (exportación SAP). Suba el archivo que le envían cada vez, completo o sólo las filas nuevas: las guías nuevas se agregan, las ya cargadas se actualizan si cambiaron y no se duplica nada.</p>
        ${ultima(cr.ultima_huacho)}${formCorte('despachos', 'despacho')}</div>
      <div class="card"><div class="card-h"><h2>REPORTE CSPCP</h2><span class="pill info">${num(cr.tickets, 0)} tickets</span></div>
        <p class="muted" style="margin:0">Tickets de balanza del puerto (PLACA, TICKET, PESO NETO, TIEMPO INGRESO, TIEMPO SALIDA). Cada ticket se cruza con el viaje por <strong>placa + vuelta</strong>, igual que en el Excel. Si un ticket llega antes que su despacho, queda guardado y se cruza solo al importar el siguiente reporte de Huacho.</p>
        ${ultima(cr.ultima_cspcp)}${formCorte('tickets', 'acopio')}</div>
    </div>
    <div class="card"><div class="card-h"><h2>Estado del cruce Huacho ↔ CSPCP</h2><a class="btn sm" href="#/viajes">Ver detalle de viajes</a></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Viajes (Huacho)</div><div class="v">${num(cr.viajes, 0)}</div></div>
        <div class="kpi"><div class="l">Tickets (CSPCP)</div><div class="v">${num(cr.tickets, 0)}</div></div>
        <div class="kpi"><div class="l">Falta descargar</div><div class="v">${num(cr.viajes_sin_ticket.length, 0)}</div><div class="s">viajes sin ticket del puerto</div></div>
        <div class="kpi"><div class="l">Tickets sin viaje</div><div class="v" style="color:${cr.tickets_sin_viaje.length ? 'var(--bad)' : 'inherit'}">${num(cr.tickets_sin_viaje.length, 0)}</div><div class="s">falta su despacho en Huacho</div></div>
      </div>
      ${cr.tickets_sin_viaje.length ? `<h3 style="margin:16px 0 8px">Tickets del puerto sin viaje en Huacho</h3>${tabla([
        { t: 'Placa', k: 'placa' }, { t: 'Ticket', k: 'ticket' }, { t: 'Peso neto', k: 'peso', n: 1 }, { t: 'Ingreso', f: (x) => fechaHora(x.ingreso) },
      ], cr.tickets_sin_viaje)}` : ''}
      ${cr.viajes_sin_ticket.length ? `<details style="margin-top:14px"><summary><strong>${cr.viajes_sin_ticket.length} viajes despachados aún sin ticket del puerto</strong></summary>${tabla([
        { t: 'N°', k: 'nro' }, { t: 'Placa', k: 'placa' }, { t: 'Transporte', k: 'transportista_nombre' }, { t: 'Guía', k: 'guia' },
        { t: 'TN Huacho', k: 'peso_origen', n: 1 }, { t: 'Salida planta', f: (x) => fechaHora(x.despacho_en) },
      ], cr.viajes_sin_ticket)}</details>` : ''}
    </div>
    ${cr.importaciones.length ? `<div class="card"><div class="card-h"><h3>Historial de importaciones</h3></div>${tabla([
      { t: 'Fecha', f: (x) => fechaHora(x.en) }, { t: 'Reporte', f: (x) => ({ despachos: 'REPORTE HUACHO', tickets: 'REPORTE CSPCP', lista: 'LISTA' }[x.tipo] || x.tipo) },
      { t: 'Archivo', k: 'archivo' }, { t: 'Usuario', k: 'por' },
      { t: 'Resultado', f: (x) => esc(x.tipo === 'despachos' ? `${x.resumen.insertados} nuevos · ${x.resumen.actualizados} actualizados · ${x.resumen.sin_cambios} sin cambios`
        : x.tipo === 'tickets' ? `${x.resumen.nuevos} nuevos · ${x.resumen.actualizados} actualizados · ${x.resumen.asignados} cruzados · ${x.resumen.sin_viaje || 0} sin viaje`
          : `${x.resumen.insertados} nuevas · ${x.resumen.actualizados} actualizadas`) },
    ], cr.importaciones)}</div>` : ''}`;
  view.insertAdjacentHTML('beforeend', `<div class="grid g2">
      ${op ? `<div class="card"><h3>LISTA: transportistas, conductores y unidades</h3>${await formularioLista()}</div>` : ''}
      <div class="card"><h3>Migrar libro de control antiguo (opcional)</h3><p class="muted">Sólo para pasar a la app una operación que se llevó en el Excel <em>REPORTE DE CONTROL UNIDADES SAL … .xlsm</em> (con su hoja DETALLE TRANSPORTE). <strong>No</strong> es para los reportes de Huacho o CSPCP.</p>${form('libro')}</div>
    </div>`);
  if (ultimoResultado) { const o = view.querySelector(`[data-res="${ultimoResultado.tipo}"]`); if (o) o.innerHTML = ultimoResultado.html; ultimoResultado = null; }
  view.querySelector('[data-lista]')?.addEventListener('submit', (e) => enviarLista(e, () => ctx.rerender()));
  view.querySelectorAll('[data-imp]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = f.dataset.imp;
    if (f.dataset.proceso && !f.cierre.value) { toast('Ingrese la fecha y hora de cierre del reporte antes de importar.', true); f.cierre.focus(); return; }
    const out = view.querySelector(`[data-res="${tipo}"]`);
    const btn = f.querySelector('button'); btn.disabled = true;
    out.innerHTML = '<span class="muted">Procesando… (un archivo grande puede tardar unos segundos)</span>';
    try {
      const fd = new FormData(f);
      const r = tipo === 'libro'
        ? await api('/importar/libro', { method: 'POST', form: fd })
        : await api(`/operaciones/${state.opId}/importar/${tipo}`, { method: 'POST', form: fd });
      if (tipo === 'libro') { out.innerHTML = resumenImport(tipo, r); refrescar(r.operacion_id, false); f.reset(); return; }
      toast(resumenTexto(tipo, r));
      const obs = [...(r.errores || []), ...(r.sin_transportista || []).map((x) => `Placa sin transportista identificado: ${x}`), ...(r.sin_viaje || []).map((x) => `Ticket sin viaje: ${x}`)];
      ultimoResultado = { tipo, html: `<div class="alert ok">${esc(resumenTexto(tipo, r))}</div>${obs.length ? `<details style="margin-top:6px"><summary>${obs.length} observaciones</summary><ul>${obs.slice(0, 300).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}` };
      ctx.rerender();
    } catch (err) { out.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`; } finally { btn.disabled = false; }
  }));
}

function resumenTexto(tipo, r) {
  const corte = r.corte ? ` ${r.corte.actualizado ? 'Se actualizó el' : 'Se creó el'} ${r.corte.numero}° reporte de ${tipo === 'despachos' ? 'despacho' : 'acopio'}: ${fechaHora(r.corte.inicio)} a ${fechaHora(r.corte.fin)}.${r.corte.posteriores ? ` ${r.corte.posteriores} viajes posteriores al cierre quedan para el siguiente reporte.` : ''}` : '';
  if (tipo === 'despachos') return `REPORTE HUACHO: ${r.insertados} viajes nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios. ${r.tickets_cruzados} tickets cruzados.${r.sin_transportista.length ? ` ${r.sin_transportista.length} placas sin transportista.` : ''}${corte}`;
  if (tipo === 'tickets') return `REPORTE CSPCP: ${r.nuevos} tickets nuevos, ${r.actualizados} actualizados. ${r.asignados} cruzados con su viaje; ${r.sin_viaje.length} sin viaje.${corte}`;
  return `LISTA: ${r.insertados} unidades nuevas, ${r.actualizados} actualizadas.`;
}

function resumenImport(tipo, r) {
  const lista = (arr) => (arr?.length ? `<details style="margin-top:6px"><summary>${arr.length} observaciones</summary><ul>${arr.slice(0, 200).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '');
  return `<div class="alert ok">Operación creada: ${num(r.viajes, 0)} viajes y ${num(r.unidades || 0, 0)} unidades importadas. Ya está seleccionada.</div>${lista(r.avisos)}`;
}

/* =================== LISTA (uno o varios archivos) =================== */
let resultadoLista = null;
/** Formulario de importación de la LISTA (se usa en Importar datos y en Lista de unidades). */
export async function formularioLista() {
  const transp = await api('/transportistas');
  const previo = resultadoLista; resultadoLista = null;
  return `<p class="muted" style="margin:0">Suba la hoja LISTA del libro de control o las listas que envían los transportistas. Puede elegir <strong>varios archivos a la vez</strong>
      y volver a cargar más en otro momento: todo se integra a la lista de la operación sin duplicar (un conductor se reconoce por su DNI; sin DNI, por la placa del tracto).
      Reconoce columnas como <em>RUC, EMPRESA/TRANSPORTISTA, AP. PATERNO, AP. MATERNO, NOMBRES</em> o <em>APELLIDOS Y NOMBRES</em>, <em>DNI, BREVETE/LICENCIA, TRACTO/PLACA, PLATAFORMA/CARRETA</em>.
      Las empresas nuevas (por RUC) se agregan al maestro de transportistas.</p>
    <form data-lista class="form" style="margin-top:12px">
      <label class="full">Archivos (uno o varios)<input type="file" name="archivo" multiple accept=".xlsx,.xlsm,.xls,.csv" required></label>
      <label class="full">Si el archivo no indica la empresa, asignar a<select name="transportista_id"><option value="">— Identificar por RUC / nombre en el archivo —</option>
        ${transp.map((t) => `<option value="${t.id}">${esc(t.razon_social)} (${esc(t.nombre_comercial)})</option>`).join('')}</select></label>
      <div class="full"><button class="btn primary">Importar a la LISTA</button></div>
    </form><div class="small" data-res-lista style="margin-top:10px">${previo || ''}</div>`;
}
export async function enviarLista(e, despues) {
  e.preventDefault();
  const f = e.target;
  const out = f.parentElement.querySelector('[data-res-lista]');
  const btn = f.querySelector('button'); btn.disabled = true;
  out.innerHTML = '<span class="muted">Leyendo archivos…</span>';
  try {
    const r = await api(`/operaciones/${state.opId}/importar/lista`, { method: 'POST', form: new FormData(f) });
    const obs = [...r.nuevos_transportistas.map((x) => `Empresa nueva agregada al maestro: ${x}`), ...r.sin_transportista.map((x) => `Sin empresa identificada: ${x}`), ...r.avisos];
    resultadoLista = `<div class="alert ok">LISTA: ${r.insertados} registros nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios
        (${r.leidas} filas leídas de ${r.archivos.length} archivo(s)${r.repetidas_en_archivo ? `; ${r.repetidas_en_archivo} repetidas entre archivos` : ''}).</div>
      <ul class="muted small" style="margin:6px 0">${r.archivos.map((a) => `<li>${esc(a.nombre)}: ${a.filas} filas${a.hojas.length ? ` (hojas: ${esc(a.hojas.join(', '))})` : ' — no se encontraron datos de conductores/unidades'}</li>`).join('')}</ul>
      ${obs.length ? `<details><summary>${obs.length} observaciones</summary><ul>${obs.slice(0, 300).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`;
    toast(`LISTA: ${r.insertados} nuevos, ${r.actualizados} actualizados`);
    const html = resultadoLista;
    if (despues) despues();
    if (document.body.contains(out)) { out.innerHTML = html; f.reset(); }
  } catch (err) { out.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`; } finally { btn.disabled = false; }
}

/* =================== USUARIOS =================== */
const ROLES = [['operador', 'Operador'], ['lector', 'Lector'], ['admin', 'Administrador'], ['transportista', 'Transportista (portal)']];
export async function vUsuarios(view, ctx) {
  if (!esAdmin()) { view.innerHTML = sinOperacion(); return; }
  const [{ usuarios, rol_por_defecto: def }, transp] = await Promise.all([api('/usuarios'), api('/transportistas')]);
  const nombreT = (id) => transp.find((t) => t.id === id)?.razon_social || '—';
  const rolSel = (r) => `<select name="rol" data-rol>${ROLES.map(([k, l]) => `<option value="${k}" ${k === r ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const empSel = (id) => `<label class="full" data-emp>Empresa de transporte *<select name="transportista_id"><option value="">— Seleccione —</option>${transp.map((t) => `<option value="${t.id}" ${t.id === id ? 'selected' : ''}>${esc(t.razon_social)} (${esc(t.nombre_comercial)})</option>`).join('')}</select></label>`;
  const internos = usuarios.filter((u) => u.rol !== 'transportista');
  const portal = usuarios.filter((u) => u.rol === 'transportista');
  const cols = (conEmpresa) => [
    { t: 'Correo', f: (u) => `<strong>${esc(u.email)}</strong>` }, { t: 'Nombre', k: 'nombre' },
    ...(conEmpresa ? [{ t: 'Empresa de transporte', f: (u) => esc(nombreT(u.transportista_id)) }] : [{ t: 'Rol', k: 'rol' }]),
    { t: 'Estado', f: (u) => (u.activo !== false ? '<span class="pill ok">Activo</span>' : '<span class="pill bad">Inactivo</span>') },
    { t: '', f: (u) => `<button class="btn sm" data-u="${esc(u.email)}">Editar</button>` },
  ];
  view.innerHTML = `<div class="card"><div class="card-h"><div><h2>Usuarios internos</h2>
      <p class="muted small" style="margin:4px 0 0">Ingresan con su cuenta de Microsoft 365. <strong>Admin</strong>: todo · <strong>Operador</strong>: registra e importa · <strong>Lector</strong>: sólo consulta.
      ${usuarios.length ? '' : '<br><strong>Aún no hay usuarios registrados: por ahora todos los que ingresan son administradores.</strong>'}</p></div>
      <button class="btn primary" id="b-new">+ Agregar usuario</button></div>
    <form id="f-def" class="btns" style="margin-bottom:12px"><label style="display:flex;gap:8px;align-items:center">Rol para usuarios no registrados
      <select name="rol_por_defecto"><option value="lector" ${def !== 'operador' ? 'selected' : ''}>lector</option><option value="operador" ${def === 'operador' ? 'selected' : ''}>operador</option></select></label>
      <button class="btn sm">Guardar</button></form>
    ${tabla(cols(false), internos, { empty: 'Sin usuarios internos registrados' })}</div>

    <div class="card"><div class="card-h"><div><h2>Usuarios transportistas (portal)</h2>
      <p class="muted small" style="margin:4px 0 0">Sólo ven y descargan los viajes y unidades de <strong>su</strong> empresa. La app les publica sus datos en una carpeta propia de SharePoint
      con permiso de sólo lectura (no tienen acceso a la información de otros transportistas). Se actualiza sola cada vez que se registran o importan viajes.</p></div>
      <div class="btns"><button class="btn" id="b-repub">Republicar portal</button><button class="btn primary" id="b-new-t">+ Agregar usuario transportista</button></div></div>
    ${tabla(cols(true), portal, { empty: 'Sin usuarios transportistas' })}
    <p class="muted small" style="margin-top:12px">Requisito: el correo del transportista debe poder iniciar sesión en el Microsoft 365 de la empresa (usuario invitado/guest).
    Si TI aún no lo ha invitado, la app igual publica sus datos y le envía la invitación de SharePoint; avísele a TI para habilitar su ingreso.</p></div>

    <p class="muted small">Importante: los roles controlan lo que la aplicación permite hacer. El acceso a los datos lo da SharePoint:
    sólo quien tenga permiso de edición en el sitio puede guardar cambios.</p>`;

  const formUsuario = (u = {}, transportista = false) => `<div class="form">
      ${u.email ? '' : '<label class="full">Correo *<input name="email" type="email" required autocomplete="off" placeholder="nombre@empresa.com"></label>'}
      <label>Nombre<input name="nombre" value="${esc(u.nombre || '')}"></label>
      ${transportista ? '<input type="hidden" name="rol" value="transportista">' : `<label>Rol${rolSel(u.rol || 'operador')}</label>`}
      ${empSel(u.transportista_id)}
      ${u.email ? `<label class="check"><input type="checkbox" name="activo" ${u.activo !== false ? 'checked' : ''}> Activo</label>` : ''}
    </div>`;
  const alAbrir = (dlg) => {
    const sel = dlg.querySelector('[data-rol]');
    const emp = dlg.querySelector('[data-emp]');
    const ver = () => { emp.style.display = !sel || sel.value === 'transportista' ? '' : 'none'; };
    sel?.addEventListener('change', ver); ver();
  };
  const resultado = (r) => { if (r?.aviso) toast(r.aviso, true); else toast('Usuario guardado'); };

  $('#f-def').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/usuarios-config', { method: 'PUT', body: { rol_por_defecto: e.target.rol_por_defecto.value } }); toast('Guardado'); } catch (err) { toast(err.message, true); }
  });
  $('#b-new').onclick = () => modal({ title: 'Agregar usuario', body: formUsuario({}, false), onOpen: alAbrir,
    onSubmit: async (d) => { resultado(await api('/usuarios', { method: 'POST', body: d })); ctx.rerender(); } });
  $('#b-new-t').onclick = () => modal({ title: 'Agregar usuario transportista', body: formUsuario({}, true), submitText: 'Crear y dar acceso', onOpen: alAbrir,
    onSubmit: async (d) => { toast('Publicando sus datos en SharePoint…'); resultado(await api('/usuarios', { method: 'POST', body: d })); ctx.rerender(); } });
  $('#b-repub').onclick = async (e) => {
    e.target.disabled = true;
    try {
      toast('Republicando el portal de transportistas…');
      const r = await api('/portal/republicar', { method: 'POST' });
      toast(`Portal actualizado para ${r.usuarios} usuario(s).`);
      r.avisos.forEach((a) => toast(a, true));
    } catch (err) { toast(err.message, true); } finally { e.target.disabled = false; }
  };
  view.addEventListener('click', (e) => {
    const email = e.target.closest('[data-u]')?.dataset.u;
    if (!email) return;
    const u = usuarios.find((x) => x.email === email);
    modal({
      title: `Editar ${u.email}`, body: formUsuario(u, u.rol === 'transportista'), onOpen: alAbrir,
      onSubmit: async (d) => { resultado(await api(`/usuarios/${encodeURIComponent(u.email)}`, { method: 'PUT', body: d })); ctx.rerender(); },
    });
  });
}
