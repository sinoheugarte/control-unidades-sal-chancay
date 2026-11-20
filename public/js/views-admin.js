import { state, api, esc, num, fecha, fechaHora, toInputDT, toast, $, modal, confirmar, tabla, puedeEscribir, esAdmin, sinOperacion, opActual } from './core.js';

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
export async function vImportar(view) {
  if (!puedeEscribir()) { view.innerHTML = '<div class="alert">Su usuario es de sólo lectura.</div>'; return; }
  const op = opActual();
  const bloque = (id, titulo, desc, necesitaOp = true) => `<div class="card"><h3>${titulo}</h3><p class="muted">${desc}</p>
    ${necesitaOp && !op ? '<div class="alert">Seleccione una operación primero.</div>' : `<form class="btns" data-imp="${id}">
      <input type="file" name="archivo" accept=".xlsx,.xlsm,.csv" required style="max-width:340px" aria-label="Archivo">
      <button class="btn primary">Importar</button></form><div class="small" data-res="${id}" style="margin-top:10px"></div>`}</div>`;
  view.innerHTML = `
    ${op ? `<div class="alert ok">Operación activa: <strong>${esc(op.nave)} · Orden ${esc(op.orden)}</strong></div>` : ''}
    <div class="grid g2">
      ${bloque('despachos', '1. Despachos de planta (reporte SAP)', 'Archivo exportado de SAP con las columnas <em>Referencia</em> (guía), <em>Placa</em>, <em>P.Neto Ent.</em>/<em>Peso TON</em>, <em>FeActDpExp</em>/<em>HrADpExp</em> y <em>Número de transportista</em> (hoja "REPORTE HUACHO"). Las guías ya registradas se omiten.')}
      ${bloque('tickets', '2. Tickets de balanza del puerto', 'Reporte con <em>PLACA</em>, <em>TICKET</em>, <em>PESO NETO</em>, <em>TIEMPO INGRESO</em> y <em>TIEMPO SALIDA</em> (hoja "REPORTE CSPCP"). Cada ticket se asigna al viaje pendiente más antiguo de la misma placa (equivalente al cruce por placa + vuelta del Excel).')}
      ${bloque('lista', '3. Lista de unidades (Lista SIO)', 'Hoja con <em>RUC</em>, <em>AP. PATERNO</em>, <em>AP. MATERNO</em>, <em>1ER NOMBRE</em>, <em>DNI</em>, <em>BREVETE</em>, <em>TRACTO</em> y <em>PLATAFORMA</em>. Las placas se normalizan (sin guiones ni espacios).')}
      ${bloque('libro', 'Libro completo (migración)', 'Suba el archivo <em>REPORTE DE CONTROL UNIDADES SAL … .xlsm</em> para crear una operación nueva con todos sus datos: nave, transportistas, lista de unidades, viajes, reportes por turno, embarque y planificación.', false)}
    </div>`;
  view.querySelectorAll('[data-imp]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = form.dataset.imp;
    const out = view.querySelector(`[data-res="${tipo}"]`);
    const btn = form.querySelector('button'); btn.disabled = true;
    out.innerHTML = '<span class="muted">Procesando…</span>';
    try {
      const fd = new FormData(form);
      const r = tipo === 'libro'
        ? await api('/importar/libro', { method: 'POST', form: fd })
        : await api(`/operaciones/${state.opId}/importar/${tipo}`, { method: 'POST', form: fd });
      out.innerHTML = resumenImport(tipo, r);
      if (tipo === 'libro') refrescar(r.operacion_id, false);
      form.reset();
    } catch (err) { out.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`; } finally { btn.disabled = false; }
  }));
}

function resumenImport(tipo, r) {
  const lista = (arr) => (arr?.length ? `<details style="margin-top:6px"><summary>${arr.length} observaciones</summary><ul>${arr.slice(0, 200).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '');
  if (tipo === 'despachos') return `<div class="alert ok">${r.insertados} viajes nuevos · ${r.duplicados} guías ya existentes · ${r.sin_transportista} sin transportista identificado</div>${lista(r.errores)}`;
  if (tipo === 'tickets') return `<div class="alert ${r.sin_viaje.length ? '' : 'ok'}">${r.asignados} de ${r.procesados} tickets asignados a viajes</div>${lista(r.sin_viaje)}`;
  if (tipo === 'lista') return `<div class="alert ok">${r.insertados} unidades nuevas · ${r.actualizados} actualizadas · ${r.sin_transportista} sin transportista</div>`;
  return `<div class="alert ok">Operación creada: ${num(r.viajes, 0)} viajes y ${num(r.unidades || 0, 0)} unidades importadas. Ya está seleccionada.</div>${lista(r.avisos)}`;
}

/* =================== USUARIOS =================== */
export async function vUsuarios(view, ctx) {
  if (!esAdmin()) { view.innerHTML = sinOperacion(); return; }
  const us = await api('/usuarios');
  view.innerHTML = `<div class="card"><div class="card-h"><div><h2>Usuarios</h2>
      <p class="muted small" style="margin:4px 0 0"><strong>Admin</strong>: todo, incluye usuarios y eliminar operaciones · <strong>Operador</strong>: registra e importa datos · <strong>Lector</strong>: sólo consulta.</p></div>
      <button class="btn primary" id="b-new">+ Nuevo usuario</button></div>
    ${tabla([
      { t: 'Usuario', f: (u) => `<strong>${esc(u.usuario)}</strong>` }, { t: 'Nombre', k: 'nombre' }, { t: 'Rol', k: 'rol' },
      { t: 'Estado', f: (u) => (u.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill bad">Inactivo</span>') },
      { t: 'Creado', f: (u) => fechaHora(u.creado_en) }, { t: '', f: (u) => `<button class="btn sm" data-u="${u.id}">Editar</button>` },
    ], us)}</div>`;
  const rolSel = (r) => `<select name="rol">${['operador', 'lector', 'admin'].map((x) => `<option ${x === r ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  $('#b-new').onclick = () => modal({
    title: 'Nuevo usuario',
    body: `<div class="form"><label>Usuario *<input name="usuario" required autocomplete="off"></label><label>Nombre *<input name="nombre" required></label>
      <label>Contraseña * (mín. 8)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><label>Rol${rolSel('operador')}</label></div>`,
    onSubmit: async (d) => { await api('/usuarios', { method: 'POST', body: d }); toast('Usuario creado'); ctx.rerender(); },
  });
  view.addEventListener('click', (e) => {
    const id = e.target.closest('[data-u]')?.dataset.u;
    if (!id) return;
    const u = us.find((x) => x.id === Number(id));
    modal({
      title: `Editar ${u.usuario}`,
      body: `<div class="form"><label>Nombre<input name="nombre" value="${esc(u.nombre)}"></label><label>Rol${rolSel(u.rol)}</label>
        <label>Nueva contraseña (opcional)<input name="password" type="password" minlength="8" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Activo</label></div>`,
      onSubmit: async (d) => { if (!d.password) delete d.password; await api(`/usuarios/${u.id}`, { method: 'PUT', body: d }); toast('Usuario actualizado'); ctx.rerender(); },
    });
  });
}
