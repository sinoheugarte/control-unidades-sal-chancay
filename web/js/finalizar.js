// Flujo "Finalizar operación": genera la presentación (PowerPoint, HTML, video), la guarda en
// SharePoint, marca la operación como FINALIZADA y envía el correo con los enlaces.
import { api, esc, toast, modal } from './core.js?v=__V__';
import * as G from './graph.js?v=__V__';
import { construirDiapositivas, pptxPresentacion, imagenesDiapositivas, htmlPresentacion, videoPresentacion, formatoVideo } from './presentacion.js?v=__V__';

export async function abrirFinalizar(op, despues) {
  const { predeterminados, usuarios } = await api('/finalizacion/destinatarios');
  // Transportistas con viajes cuyo reporte aún no está confirmado
  try { await api(`/operaciones/${op.id}/confirmaciones/sincronizar`, { method: 'POST' }); } catch { /* */ }
  const sinConfirmar = ((await api(`/operaciones/${op.id}/tablero`)).transportistas || []).filter((t) => t.viajes_realizados > 0 && !t.reporte_confirmado);
  const marcados = new Set(predeterminados);
  const extra = predeterminados.filter((e) => !usuarios.some((u) => u.email === e));
  const video = formatoVideo();
  const yaFinal = op.estado === 'FINALIZADA';
  const dlg = modal({
    title: yaFinal ? `Regenerar y reenviar · ${op.nave} · Orden ${op.orden}` : `Finalizar operación · ${op.nave} · Orden ${op.orden}`,
    wide: true,
    submitText: yaFinal ? 'Generar y enviar' : 'Finalizar y enviar',
    body: `${sinConfirmar.length ? `<div class="alert" style="margin-bottom:12px"><strong>${sinConfirmar.length} transportista${sinConfirmar.length > 1 ? 's' : ''} sin reporte confirmado:</strong>
        ${sinConfirmar.map((t) => `${esc(t.nombre_comercial)} (${t.viajes_realizados} viajes)`).join(' · ')}. Puede finalizar igual, o esperar su confirmación desde el portal o marcarla en Transportistas.</div>`
        : '<div class="alert ok" style="margin-bottom:12px">Todos los transportistas con viajes tienen su reporte confirmado.</div>'}
      <p class="muted" style="margin-top:0">Se generará la presentación de la operación, se guardará en SharePoint
      (<em>Control Unidades Sal/Presentaciones</em>), la operación quedará como <strong>FINALIZADA</strong> y se enviará un correo
      desde su cuenta de Microsoft 365 con el enlace a la app y a los archivos.</p>
      <h3 style="margin:14px 0 6px">Destinatarios</h3>
      <div class="form" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
        ${usuarios.map((u) => `<label class="check"><input type="checkbox" name="u:${esc(u.email)}" ${marcados.has(u.email) ? 'checked' : ''}> ${esc(u.nombre)} <span class="muted small">${esc(u.email)}</span></label>`).join('') || '<p class="muted">No hay usuarios internos registrados.</p>'}
        <label class="full">Otros correos (separados por coma o salto de línea)<textarea name="extra" rows="2" placeholder="gerencia@empresa.com, cliente@empresa.com">${esc(extra.join(', '))}</textarea></label>
        <label class="full">Mensaje (opcional)<textarea name="mensaje" rows="3" placeholder="Se informa que la operación ha sido finalizada…"></textarea></label>
        <label class="check full"><input type="checkbox" name="guardar" checked> Guardar estos destinatarios como predeterminados</label>
      </div>
      <h3 style="margin:14px 0 6px">Fotos de la operación <span class="muted small" style="font-weight:500">(opcional)</span></h3>
      <p class="muted small" style="margin:0 0 8px">Se agregan como diapositivas de <strong>Registro fotográfico</strong> en el PowerPoint, la presentación HTML y el video.</p>
      <div class="fotos-sel">
        <label class="btn sm"><input type="file" id="fin-fotos" accept="image/*" multiple hidden>📷 Agregar fotos</label>
        <span class="muted small" id="fin-fotos-n">Ninguna foto</span>
      </div>
      <div class="fotos-lista" id="fin-fotos-lista"></div>
      <h3 style="margin:14px 0 6px">Archivos de la presentación</h3>
      <div class="btns">
        <label class="check"><input type="checkbox" name="pptx" checked> PowerPoint (.pptx)</label>
        <label class="check"><input type="checkbox" name="html" checked> Presentación HTML</label>
        <label class="check"><input type="checkbox" name="video" ${video ? 'checked' : 'disabled'}> Video (.${video?.ext || 'mp4'}) ${video ? '<span class="muted small">— tarda ~1 minuto, mantenga esta pestaña visible</span>' : '<span class="muted small">— su navegador no permite grabar video</span>'}</label>
      </div>`,
    onSubmit: async (d) => {
      const para = [...Object.keys(d).filter((k) => k.startsWith('u:') && d[k]).map((k) => k.slice(2)),
        ...String(d.extra || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)];
      // Pedir el permiso de correo primero (requiere el clic del usuario para la ventana de Microsoft)
      let avisoCorreo = null;
      if (para.length) { try { await G.asegurarPermisoCorreo(); } catch (e) { avisoCorreo = e.message; } }
      const lista = fotos.map((f) => ({ ...f, desc: String(d[`foto:${f.id}`] || '').trim() }));
      await ejecutar(op, { para, mensaje: d.mensaje, guardar: d.guardar, pptx: d.pptx, html: d.html, video: d.video && !!video, avisoCorreo, fotos: lista }, despues);
    },
  });
  // Fotos: se reducen a 1600 px (JPEG) para que la presentación y el video no pesen de más
  const fotos = [];
  const pintar = () => {
    dlg.querySelector('#fin-fotos-n').textContent = fotos.length ? `${fotos.length} foto${fotos.length > 1 ? 's' : ''}` : 'Ninguna foto';
    dlg.querySelector('#fin-fotos-lista').innerHTML = fotos.map((f) => `<div class="foto-it"><img src="${f.src}" alt="">
      <input name="foto:${f.id}" placeholder="Descripción (opcional)" maxlength="80" value="${esc(f.desc || '')}">
      <button type="button" class="btn sm" data-quitar="${f.id}" title="Quitar">✕</button></div>`).join('');
  };
  dlg.querySelector('#fin-fotos').addEventListener('change', async (e) => {
    const archivos = [...e.target.files].filter((x) => x.type.startsWith('image/'));
    e.target.value = '';
    // conserva las descripciones ya escritas antes de volver a pintar la lista
    fotos.forEach((f) => { const i = dlg.querySelector(`[name="foto:${f.id}"]`); if (i) f.desc = i.value; });
    for (const a of archivos) {
      if (fotos.length >= 24) { toast('Máximo 24 fotos', true); break; }
      try { fotos.push({ id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...(await reducirFoto(a)) }); } catch { toast(`No se pudo leer ${a.name}`, true); }
    }
    pintar();
  });
  dlg.querySelector('#fin-fotos-lista').addEventListener('click', (e) => {
    const id = e.target.closest('[data-quitar]')?.dataset.quitar; if (!id) return;
    fotos.forEach((f) => { const i = dlg.querySelector(`[name="foto:${f.id}"]`); if (i) f.desc = i.value; });
    fotos.splice(fotos.findIndex((f) => f.id === id), 1); pintar();
  });
}

/** Lee una foto, corrige su tamaño (máx. 1600 px) y la devuelve como JPEG en base64 con sus dimensiones. */
async function reducirFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const im = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
    return { src: c.toDataURL('image/jpeg', 0.85), w, h };
  } finally { URL.revokeObjectURL(url); }
}

async function ejecutar(op, o, despues) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>Generando presentación…</h2></div><div class="db"><ol id="pasos" style="margin:0;padding-left:20px;line-height:1.9"></ol>
    <div class="bar" style="margin-top:12px"><i id="barra" style="width:0%"></i></div><p class="muted small" id="det"></p></div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('cancel', (e) => e.preventDefault());
  dlg.showModal();
  const pasos = dlg.querySelector('#pasos'), barra = dlg.querySelector('#barra'), det = dlg.querySelector('#det');
  let actual = null;
  const paso = (t) => { if (actual) actual.textContent = `✓ ${actual.dataset.t}`; actual = document.createElement('li'); actual.dataset.t = t; actual.textContent = `… ${t}`; pasos.appendChild(actual); };
  const avance = (p) => { barra.style.width = `${Math.round(p * 100)}%`; };
  try {
    paso('Preparando datos y gráficos');
    const d = await api(`/operaciones/${op.id}/tablero`);
    const slides = construirDiapositivas(d, o.fotos || []);
    const base = `${d.operacion.nave} - ORDEN ${d.operacion.orden} - PRESENTACION`.replace(/[\\/:*?"<>|#%]/g, ' ');
    const archivos = [];
    avance(0.1);
    if (o.pptx) { paso('PowerPoint'); archivos.push({ clave: 'pptx', nombre: `${base}.pptx`, blob: await pptxPresentacion(slides, d.operacion) }); avance(0.25); }
    let imgs = null;
    if (o.html || o.video) { paso('Diapositivas'); imgs = await imagenesDiapositivas(slides, d.operacion); }
    if (o.html) { paso('Presentación HTML'); archivos.push({ clave: 'html', nombre: `${base}.html`, blob: htmlPresentacion(d.operacion, imgs) }); avance(0.35); }
    if (o.video) {
      paso(`Grabando video (${imgs.length * 5} s)`);
      const v = await videoPresentacion(imgs, { segundos: 5, alProgreso: (p) => { avance(0.35 + p * 0.45); det.textContent = `Video: ${Math.round(p * 100)} %`; } });
      archivos.push({ clave: 'video', nombre: `${base}.${v.ext}`, blob: v.blob });
      det.textContent = '';
    }
    avance(0.85);
    paso('Guardando en SharePoint y enviando el correo');
    const r = await api(`/operaciones/${op.id}/finalizar`, { method: 'POST', body: {
      destinatarios: o.avisoCorreo ? [] : o.para, mensaje: o.mensaje, guardar: o.guardar, archivos, progreso: (t) => { det.textContent = t; } } });
    avance(1);
    dlg.close(); dlg.remove();
    resultado(op, r, o);
    despues?.();
  } catch (e) {
    dlg.close(); dlg.remove();
    toast(`No se pudo completar: ${e.message}`, true);
  }
}

function resultado(op, r, o) {
  const e = r.enlaces || {};
  const link = (u, t) => (u ? `<li><a href="${esc(u)}" target="_blank" rel="noopener">${t}</a></li>` : '');
  const fallo = o.avisoCorreo || r.correo?.error;
  modal({
    title: 'Operación finalizada',
    body: `<p><strong>${esc(op.nave)} · Orden ${esc(op.orden)}</strong> quedó como <span class="pill ok">FINALIZADA</span>.</p>
      <ul>${link(e.pptx, 'Presentación PowerPoint')}${link(e.html, 'Presentación HTML')}${link(e.video, 'Video')}${link(r.urlApp, 'Enlace a la app (para el correo)')}</ul>
      ${o.para.length ? (fallo
        ? `<div class="alert bad">No se pudo enviar el correo automático: ${esc(fallo)}</div>
           <p class="muted small">Puede enviarlo desde Outlook con los enlaces ya escritos (para habilitar el envío automático, TI debe permitir el permiso <em>Mail.Send</em> a la app en Entra ID).</p>
           <p><a class="btn primary" href="${esc(r.mailto)}">Abrir correo en Outlook</a></p>`
        : `<div class="alert ok">Correo enviado a: ${esc(r.correo.para.join(', '))}</div>`) : '<p class="muted">No se seleccionaron destinatarios.</p>'}`,
  });
}
