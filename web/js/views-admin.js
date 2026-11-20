import { state, api, esc, num, fecha, fechaHora, toInputDT, toast, $, modal, confirmar, tabla, puedeEscribir, esAdmin, sinOperacion, opActual } from './core.js?v=__V__';

const refrescar = (id, render = true) => window.dispatchEvent(new CustomEvent('app:ops', { detail: { id, render } }));

/* =================== OPERACIONES =================== */
export async function vOperaciones(view) {
  const ops = await api('/operaciones');
  const edit = puedeEscribir();
  view.innerHTML = `<div class="card"><div class="card-h"><h2>Operaciones (nave / orden)</h2>
      ${edit ? '<div class="btns"><a class="btn" href="#/importar">Importar libro Excel</a><button class="btn primary" id="b-new">+ Nueva operación</button></div>' : ''}</div>
    ${tabla([
      { t: 'Nave', f: (o) => `<strong>${esc(o.nave)}</strong>` }, { t: 'Orden', k: 'orden' }, { t: 'Cliente', k: 'cliente' }, { t: 'Producto', k: 'producto' },
      { t: 'ETA', f: (o) => fechaHora(o.eta) }, { t: 'Inicio', f: (o) => fecha(o.fecha_inicio) }, { t: 'TN prog.', k: 'tn_programadas', n: 1, d: 0 },
      { t: 'Viajes', k: 'n_viajes', n: 1, d: 0 }, { t: 'Estado', f: (o) => `<span class="pill ${o.estado === 'CERRADA' ? 'ok' : 'info'}">${esc(o.estado)}</span>` },
      { t: '', f: (o) => `<div class="btns"><button class="btn sm" data-sel="${o.id}">${o.id === state.opId ? 'Activa ✓' : 'Seleccionar'}</button>
        ${edit ? `<button class="btn sm" data-op="${o.id}">Editar</button>` : ''}</div>` },
    ], ops, { empty: 'No hay operaciones. Cree una nueva o importe el libro Excel del reporte.' })}</div>`;
  $('#b-new')?.addEventListener('click', () => opModal(null));
  view.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sel]')?.dataset.sel;
    if (s) { refrescar(Number(s)); toast('Operación seleccionada'); return; }
    const id = e.target.closest('[data-op]')?.dataset.op;
    if (id) opModal(ops.find((o) => o.id === Number(id)));
  });
}

function opModal(o) {
  const nuevo = !o; o = o || { empresa: 'PACIFICO DESPACHOS S.A.C.', estado: 'EN CURSO' };
  const f = (k, l, type = 'text', extra = '') => `<label>${l}<input name="${k}" type="${type}" value="${esc(type === 'datetime-local' ? toInputDT(o[k]) : o[k] ?? '')}" ${extra}></label>`;
  const dlg = modal({
    title: nuevo ? 'Nueva operación' : `${o.nave} · Orden ${o.orden}`,
    wide: true,
    body: `<div class="form">
      ${f('nave', 'Nave *', 'text', 'required')}${f('orden', 'Orden *', 'text', 'required')}${f('manifiesto', 'Manifiesto')}${f('dam', 'DAM')}
      ${f('eta', 'ETA', 'datetime-local')}${f('fecha_inicio', 'Fecha inicio', 'date')}${f('cliente', 'Cliente')}${f('producto', 'Producto')}
      ${f('referencia', 'Referencia')}${f('punto_salida', 'Punto de salida')}${f('punto_llegada', 'Punto de llegada')}${f('empresa', 'Empresa')}
      ${f('coordinador', 'Coordinador de transporte')}
      ${f('tn_programadas', 'TN programadas *', 'number', 'step="0.01" min="0" required')}
      ${f('tn_embarque_programadas', 'TN programadas embarque', 'number', 'step="0.01" min="0"')}
      ${f('tn_draft_sgs', 'TN embarcadas draft SGS', 'number', 'step="0.01" min="0"')}
      <label>Estado<select name="estado">${['EN CURSO', 'CERRADA'].map((s) => `<option ${s === o.estado ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${!nuevo && esAdmin() ? '<div class="full"><button type="button" class="btn danger sm" id="b-del">Eliminar operación y todos sus datos</button></div>' : ''}
    </div>`,
    onSubmit: async (d) => {
      const r = nuevo ? await api('/operaciones', { method: 'POST', body: d }) : await api(`/operaciones/${o.id}`, { method: 'PUT', body: d });
      toast('Operación guardada'); refrescar(r.id);
    },
  });
  $('#b-del', dlg)?.addEventListener('click', async () => {
    if (!(await confirmar(`Se eliminarán la operación ${o.nave} / ${o.orden}, sus ${o.n_viajes} viajes, unidades y reportes. ¿Continuar?`))) return;
    await api(`/operaciones/${o.id}`, { method: 'DELETE' }); dlg.close(); dlg.remove(); toast('Operación eliminada'); refrescar();
  });
}

/* =================== IMPORTAR =================== */
let ultimoResultado = null; // { tipo, html } para mostrarlo tras recargar la pantalla
export async function vImportar(view, ctx) {
  if (!puedeEscribir()) { view.innerHTML = '<div class="alert">Su usuario es de sólo lectura.</div>'; return; }
  const op = opActual();
  const cr = op ? await api(`/operaciones/${state.opId}/cruce`) : null;
  const ultima = (u) => (u ? `<p class="muted small" style="margin:6px 0 0">Última carga: <strong>${esc(fechaHora(u.en))}</strong> por ${esc(u.por)} · ${esc(u.archivo)}</p>` : '<p class="muted small" style="margin:6px 0 0">Aún no se ha cargado.</p>');
  const form = (id) => `<form class="btns" data-imp="${id}" style="margin-top:12px">
      <input type="file" name="archivo" accept=".xlsx,.xlsm,.xls,.csv" required style="max-width:340px" aria-label="Archivo">
      <button class="btn primary">Importar</button></form><div class="small" data-res="${id}" style="margin-top:10px"></div>`;
  view.innerHTML = !op ? `<div class="alert">Seleccione o cree una operación primero. También puede crearla importando el libro completo (abajo).</div>` : `
    <div class="alert ok">Operación activa: <strong>${esc(op.nave)} · Orden ${esc(op.orden)}</strong></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>REPORTE HUACHO</h2><span class="pill info">${num(cr.con_guia, 0)} guías</span></div>
        <p class="muted" style="margin:0">Despachos de planta (exportación SAP). Suba el archivo que le envían cada vez, completo o sólo las filas nuevas: las guías nuevas se agregan, las ya cargadas se actualizan si cambiaron y no se duplica nada.</p>
        ${ultima(cr.ultima_huacho)}${form('despachos')}</div>
      <div class="card"><div class="card-h"><h2>REPORTE CSPCP</h2><span class="pill info">${num(cr.tickets, 0)} tickets</span></div>
        <p class="muted" style="margin:0">Tickets de balanza del puerto (PLACA, TICKET, PESO NETO, TIEMPO INGRESO, TIEMPO SALIDA). Cada ticket se cruza con el viaje por <strong>placa + vuelta</strong>, igual que en el Excel. Si un ticket llega antes que su despacho, queda guardado y se cruza solo al importar el siguiente reporte de Huacho.</p>
        ${ultima(cr.ultima_cspcp)}${form('tickets')}</div>
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
      ${op ? `<div class="card"><h3>Lista de unidades (Lista SIO)</h3><p class="muted">Hoja con <em>RUC</em>, <em>AP. PATERNO</em>, <em>AP. MATERNO</em>, <em>1ER NOMBRE</em>, <em>DNI</em>, <em>BREVETE</em>, <em>TRACTO</em> y <em>PLATAFORMA</em> (hoja "LISTA").</p>${form('lista')}</div>` : ''}
      <div class="card"><h3>Libro completo (nueva operación)</h3><p class="muted">Suba el archivo <em>REPORTE DE CONTROL UNIDADES SAL … .xlsm</em> para crear una operación nueva con todos sus datos.</p>${form('libro')}</div>
    </div>`);
  if (ultimoResultado) { const o = view.querySelector(`[data-res="${ultimoResultado.tipo}"]`); if (o) o.innerHTML = ultimoResultado.html; ultimoResultado = null; }
  view.querySelectorAll('[data-imp]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = f.dataset.imp;
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
  if (tipo === 'despachos') return `REPORTE HUACHO: ${r.insertados} viajes nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios. ${r.tickets_cruzados} tickets cruzados.${r.sin_transportista.length ? ` ${r.sin_transportista.length} placas sin transportista.` : ''}`;
  if (tipo === 'tickets') return `REPORTE CSPCP: ${r.nuevos} tickets nuevos, ${r.actualizados} actualizados. ${r.asignados} cruzados con su viaje; ${r.sin_viaje.length} sin viaje.`;
  return `LISTA: ${r.insertados} unidades nuevas, ${r.actualizados} actualizadas.`;
}

function resumenImport(tipo, r) {
  const lista = (arr) => (arr?.length ? `<details style="margin-top:6px"><summary>${arr.length} observaciones</summary><ul>${arr.slice(0, 200).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '');
  return `<div class="alert ok">Operación creada: ${num(r.viajes, 0)} viajes y ${num(r.unidades || 0, 0)} unidades importadas. Ya está seleccionada.</div>${lista(r.avisos)}`;
}

/* =================== USUARIOS =================== */
export async function vUsuarios(view, ctx) {
  if (!esAdmin()) { view.innerHTML = sinOperacion(); return; }
  const { usuarios, rol_por_defecto: def } = await api('/usuarios');
  const rolSel = (r, name = 'rol') => `<select name="${name}">${['operador', 'lector', 'admin'].map((x) => `<option ${x === r ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  view.innerHTML = `<div class="card"><div class="card-h"><div><h2>Usuarios y roles</h2>
      <p class="muted small" style="margin:4px 0 0">Todos ingresan con su cuenta de Microsoft 365. <strong>Admin</strong>: todo · <strong>Operador</strong>: registra e importa · <strong>Lector</strong>: sólo consulta.
      ${usuarios.length ? '' : '<br><strong>Aún no hay usuarios registrados: por ahora todos los que ingresan son administradores.</strong>'}</p></div>
      <button class="btn primary" id="b-new">+ Agregar usuario</button></div>
    <form id="f-def" class="btns" style="margin-bottom:12px"><label style="display:flex;gap:8px;align-items:center">Rol para usuarios no registrados ${rolSel(def === 'operador' ? 'operador' : 'lector', 'rol_por_defecto').replace('<option>admin</option>', '').replace('<option selected>admin</option>', '')}</label>
      <button class="btn sm">Guardar</button></form>
    ${tabla([
      { t: 'Correo', f: (u) => `<strong>${esc(u.email)}</strong>` }, { t: 'Nombre', k: 'nombre' }, { t: 'Rol', k: 'rol' },
      { t: 'Estado', f: (u) => (u.activo !== false ? '<span class="pill ok">Activo</span>' : '<span class="pill bad">Inactivo</span>') },
      { t: '', f: (u) => `<button class="btn sm" data-u="${esc(u.email)}">Editar</button>` },
    ], usuarios, { empty: 'Sin usuarios registrados' })}
    <p class="muted small" style="margin-top:12px">Importante: los roles controlan lo que la aplicación permite hacer. El acceso a los datos lo da SharePoint:
    sólo quien tenga permiso de edición en el sitio puede guardar cambios.</p></div>`;
  $('#f-def').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/usuarios-config', { method: 'PUT', body: { rol_por_defecto: e.target.rol_por_defecto.value } }); toast('Guardado'); } catch (err) { toast(err.message, true); }
  });
  $('#b-new').onclick = () => modal({
    title: 'Agregar usuario',
    body: `<div class="form"><label class="full">Correo Microsoft 365 *<input name="email" type="email" required autocomplete="off" placeholder="nombre@empresa.com"></label>
      <label>Nombre<input name="nombre"></label><label>Rol${rolSel('operador')}</label></div>`,
    onSubmit: async (d) => { await api('/usuarios', { method: 'POST', body: d }); toast('Usuario agregado'); ctx.rerender(); },
  });
  view.addEventListener('click', (e) => {
    const email = e.target.closest('[data-u]')?.dataset.u;
    if (!email) return;
    const u = usuarios.find((x) => x.email === email);
    modal({
      title: `Editar ${u.email}`,
      body: `<div class="form"><label>Nombre<input name="nombre" value="${esc(u.nombre || '')}"></label><label>Rol${rolSel(u.rol)}</label>
        <label class="check"><input type="checkbox" name="activo" ${u.activo !== false ? 'checked' : ''}> Activo</label></div>`,
      onSubmit: async (d) => { await api(`/usuarios/${encodeURIComponent(u.email)}`, { method: 'PUT', body: d }); toast('Usuario actualizado'); ctx.rerender(); },
    });
  });
}
