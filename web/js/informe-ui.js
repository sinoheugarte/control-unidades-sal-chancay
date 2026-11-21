// Ventana "Informe para el cliente": elige formatos, genera y (opcional) guarda en SharePoint.
import { api, esc, toast, modal, descargarBlob } from './core.js?v=__V__';
import * as G from './graph.js?v=__V__';
import { pdfInforme, pptxInforme, videoInforme, formatoVideoAudio, vistaPrevia } from './informe.js?v=__V__';

const seguro = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- .]+/g, '').replace(/\s+/g, ' ').trim();

export async function abrirInforme(op) {
  const d = await api(`/operaciones/${op.id}/tablero`);
  const video = formatoVideoAudio();
  const prev = await vistaPrevia(d);
  const base = seguro(`Informe de operacion - ${op.nave} - Orden ${op.orden}`);
  const dlg = modal({
    title: `Informe para el cliente · ${op.nave} · Orden ${op.orden}`, wide: true, submitText: 'Generar informe',
    body: `<p class="muted" style="margin-top:0">Análisis completo de la operación (cumplimiento, ritmos, jornadas, transportistas, flota, atención en puerto,
      balance de pesos, hallazgos y recomendaciones) en ${prev.length} diapositivas con diseño para presentar al cliente.</p>
      <div class="inf-prev">${prev.map((src, i) => `<img src="${src}" alt="Diapositiva ${i + 1}" loading="lazy">`).join('')}</div>
      <h3 style="margin:14px 0 8px">Formatos</h3>
      <div class="pant-sel">
        <label class="pant"><input type="checkbox" name="pdf" checked><span class="ico" style="--c:#dc2626">PDF</span><span>PDF del informe</span></label>
        <label class="pant"><input type="checkbox" name="pptx" checked><span class="ico" style="--c:#ea580c">PPT</span><span>PowerPoint</span></label>
        <label class="pant"><input type="checkbox" name="canva"><span class="ico" style="--c:#7c3aed">C</span><span>Canva (importar)</span></label>
        <label class="pant"><input type="checkbox" name="video" ${video ? 'checked' : 'disabled'}><span class="ico" style="--c:#0891b2">▶</span><span>Video animado con música${video ? '' : ' (no disponible en este navegador)'}</span></label>
      </div>
      <div class="form" style="margin-top:12px">
        <label class="check full"><input type="checkbox" name="musica" checked> Incluir música de fondo en el video</label>
        <label class="check full"><input type="checkbox" name="sp"><span>Guardar también en SharePoint (<em>Presentaciones</em>) y obtener los enlaces para compartir</span></label>
      </div>
      <p class="muted small" style="margin-bottom:0">El video se graba en tiempo real (≈ ${prev.length * 6} segundos): mantenga esta pestaña visible mientras se genera.</p>`,
    onSubmit: async (f) => {
      if (!f.pdf && !f.pptx && !f.canva && !f.video) throw new Error('Elija al menos un formato');
      setTimeout(() => generar(d, op, base, f), 0);
    },
  });
  return dlg;
}

async function generar(d, op, base, f) {
  const pasos = [f.pdf && 'pdf', (f.pptx || f.canva) && 'pptx', f.video && 'video'].filter(Boolean);
  const prog = modal({ title: 'Generando el informe', body: `<div class="cargando" style="padding:20px 0"><i></i><span id="inf-paso">Preparando…</span>
    <div class="bar" style="width:min(420px,80vw)"><i id="inf-bar" style="width:0%;animation:none"></i></div></div>` });
  const paso = (t, frac) => { const e = prog.querySelector('#inf-paso'); if (e) e.textContent = t; const b = prog.querySelector('#inf-bar'); if (b && frac != null) b.style.width = `${Math.round(frac * 100)}%`; };
  const res = [];
  try {
    for (const [i, k] of pasos.entries()) {
      const fr = i / pasos.length;
      if (k === 'pdf') { paso('Generando PDF…', fr); res.push({ tipo: 'PDF', nombre: `${base}.pdf`, blob: await pdfInforme(d) }); }
      if (k === 'pptx') { paso('Generando PowerPoint…', fr); res.push({ tipo: 'PowerPoint', nombre: `${base}.pptx`, blob: await pptxInforme(d) }); }
      if (k === 'video') {
        paso('Grabando el video (en tiempo real)…', fr);
        const v = await videoInforme(d, { conMusica: !!f.musica, alProgreso: (p) => paso(`Grabando el video… ${Math.round(p * 100)} %`, fr + p / pasos.length) });
        res.push({ tipo: 'Video', nombre: `${base}.${v.ext}`, blob: v.blob });
      }
    }
    paso('Listo', 1);
    if (f.sp) {
      paso('Guardando en SharePoint…', 1);
      const carpeta = `Presentaciones/${seguro(`${op.nave} - ORDEN ${op.orden}`)}/Informe cliente`;
      for (const r of res) { try { await G.subirArchivo(`${carpeta}/${r.nombre}`, r.blob, r.blob.type); r.url = await G.crearEnlace(`${carpeta}/${r.nombre}`); } catch (e) { r.error = e.message; } }
    }
  } catch (e) { toast(`No se pudo generar el informe: ${e.message}`, true); } finally { prog.close(); prog.remove(); }
  if (!res.length) return;
  res.forEach((r) => descargarBlob(r.blob, r.nombre));
  const dl = modal({
    title: 'Informe listo', wide: true,
    body: `<p style="margin-top:0">Se descargaron ${res.length} archivo(s) en su equipo.</p>
      <div class="vlista">${res.map((r, i) => `<div class="vrow"><span><strong>${esc(r.tipo)}</strong>&nbsp;· ${esc(r.nombre)}</span>
        <b>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir enlace</a>` : r.error ? `<span class="muted small">${esc(r.error)}</span>` : ''}
        <button type="button" class="btn sm" data-bajar="${i}">Descargar</button></b></div>`).join('')}</div>
      ${f.canva ? `<div class="alert" style="margin-top:12px"><strong>Para abrirlo en Canva:</strong> en Canva elija <em>Crear un diseño → Importar archivo</em> y suba
        <em>${esc(`${base}.pptx`)}</em> (o el PDF). Canva lo convierte en un diseño editable con sus animaciones y plantillas.
        <div style="margin-top:8px"><a class="btn sm primary" href="https://www.canva.com/" target="_blank" rel="noopener">Abrir Canva</a></div></div>` : ''}`,
  });
  dl.addEventListener('click', (e) => { const i = e.target.closest('[data-bajar]')?.dataset.bajar; if (i != null) descargarBlob(res[i].blob, res[i].nombre); });
}
