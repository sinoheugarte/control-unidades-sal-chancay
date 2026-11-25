// Presentación de cierre de una operación: PowerPoint (editable), HTML autónomo y video.
// Todo se genera en el navegador a partir del tablero de la operación.
import { logoBase64 } from './excel.js?v=__V__';

const AZUL = '#1F4E79', AZUL2 = '#2E75B6', NARANJA = '#E07B24', VERDE = '#1D7A4F', GRIS = '#5E6B7C', CLARO = '#F4F6F9';
const SERIE = ['#1F5FA8', '#E07B24', '#2A9D8F', '#8E5BB5', '#D1495B', '#6C8A1F', '#B08900', '#4F6D8F'];
const nf = (d) => new Intl.NumberFormat('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = (v) => (v == null ? '—' : nf(0).format(v));
const n2 = (v) => (v == null ? '—' : nf(3).format(v)); // toneladas: 3 decimales
const pct = (v) => (v == null ? '—' : `${nf(1).format(v * 100)} %`);
const fecha = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);

const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) {
    cargados.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`No se pudo cargar ${src}`)); document.head.appendChild(s); }));
  }
  return cargados.get(src);
}
const imagen = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** Dibuja un gráfico Chart.js fuera de pantalla y devuelve un PNG (data URL). */
function graficoPNG(config, w = 1600, h = 760) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  const fondo = { id: 'fondo', beforeDraw: (c) => { c.ctx.save(); c.ctx.fillStyle = '#fff'; c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore(); } };
  Chart.defaults.color = '#34404f'; Chart.defaults.borderColor = '#e2e7ee';
  const ch = new Chart(ctx, { ...config, plugins: [fondo], options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 1,
    plugins: { ...(config.options?.plugins || {}), legend: { position: 'bottom', labels: { font: { size: 22 }, boxWidth: 22 }, ...(config.options?.plugins?.legend || {}) } },
    scales: Object.fromEntries(Object.entries(config.options?.scales || { x: {}, y: {} }).map(([k, v]) => [k, { ...v, ticks: { font: { size: 20 }, ...(v.ticks || {}) } }])) } });
  const url = canvas.toDataURL('image/png');
  ch.destroy();
  return url;
}

/** Arma el contenido de las diapositivas a partir de GET /operaciones/:id/tablero. */
export function construirDiapositivas(d, fotos = []) {
  const op = d.operacion, t = d.totales, e = d.embarque;
  const rd = d.reportes_despacho.filter((r) => r.tn_total !== null), ra = d.reportes_acopio.filter((r) => r.tn_total !== null);
  const n = Math.max(rd.length, ra.length);
  const graf = {};
  if (n) {
    graf.avance = graficoPNG({ type: 'line', data: { labels: Array.from({ length: n }, (_, i) => `R${i + 1}`), datasets: [
      { label: 'Despacho (Huacho)', data: rd.map((r) => r.tn_total), borderColor: SERIE[0], backgroundColor: SERIE[0], borderWidth: 4, pointRadius: 6 },
      { label: 'Acopio (CSPCP)', data: ra.map((r) => r.tn_total), borderColor: SERIE[1], backgroundColor: SERIE[1], borderWidth: 4, pointRadius: 6 },
      { label: 'Programado', data: Array(n).fill(t.tn_programadas), borderColor: '#94a3b8', borderDash: [10, 8], pointRadius: 0, borderWidth: 3 }] },
    options: { scales: { y: { beginAtZero: true } } } });
  }
  const jd = d.jornadas.despacho, dias = [...new Set(jd.map((x) => x.fecha))];
  const J = ['23:00 - 07:00', '07:00 - 16:00', '16:00 - 23:00'];
  if (dias.length) {
    graf.jornadas = graficoPNG({ type: 'bar', data: { labels: dias.map(fecha), datasets: J.map((j, i) => ({ label: j, backgroundColor: SERIE[i], data: dias.map((f) => jd.find((x) => x.fecha === f && x.jornada === j)?.tn || 0) })) },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
  }
  const tr = d.transportistas.filter((x) => x.viajes_realizados).sort((a, b) => b.tn_final - a.tn_final);
  if (tr.length) {
    graf.transportistas = graficoPNG({ type: 'bar', data: { labels: tr.map((x) => x.nombre_comercial), datasets: [{ label: 'TN final CSPCP', data: tr.map((x) => x.tn_final), backgroundColor: SERIE[0], borderRadius: 6 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } } }, 800, 700);
  }
  if (d.tiempos.length) {
    graf.tiempos = graficoPNG({ type: 'bar', data: { labels: d.tiempos.map((x) => fecha(x.dia)), datasets: ['<=30 MIN', '>30 MIN - <1 HR', '>=1 HR'].map((r, i) => ({ label: r, backgroundColor: [VERDE, '#E0A100', '#C0392B'][i], data: d.tiempos.map((x) => x[r]) })) },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
  }
  const totTr = tr.reduce((s, x) => s + x.tn_final, 0) || 1;
  const S = [];
  S.push({ tipo: 'portada', titulo: 'INFORME DE OPERACIÓN', sub: `${op.nave} · ORDEN ${op.orden}`,
    lineas: [op.cliente, `${op.producto || 'SAL A GRANEL'} · ${op.punto_salida || ''} → ${op.punto_llegada || ''}`, `Acopio: ${fecha(d.resumen?.inicio_acopio)} al ${fecha(d.resumen?.fin_acopio)}`, op.dam ? `DAM ${op.dam}` : ''].filter(Boolean) });
  S.push({ tipo: 'kpis', titulo: 'Resumen de la operación', kpis: [
    ['TN programadas', n2(t.tn_programadas)], ['TN despachadas (Huacho)', n2(t.tn_despacho)], ['TN acopiadas (CSPCP)', n2(t.tn_acopio)],
    ['TN embarcadas', n2(t.tn_embarque)], ['Draft SGS', n2(t.tn_draft_sgs)], ['Viajes', n0(t.viajes)],
    ['Unidades activas', n0(t.unidades_activas)], ['Prom. TN por unidad', n2(t.peso_prom_unidad)], ['Atención en puerto (prom.)', `${hm(t.tiempo_prom_min)} h`]] });
  if (graf.avance) S.push({ tipo: 'grafico', titulo: 'Avance acumulado por reporte', sub: 'TN despachadas vs. acopiadas frente a lo programado', img: graf.avance });
  if (graf.jornadas) S.push({ tipo: 'grafico', titulo: 'Despacho por día y jornada', sub: 'TN despachadas en planta Huacho', img: graf.jornadas });
  if (tr.length) {
    S.push({ tipo: 'tabla', titulo: 'Participación de transportistas', img: graf.transportistas,
      cols: ['Transportista', 'Viajes', 'TN Huacho', 'TN CSPCP', '%'], alin: ['l', 'r', 'r', 'r', 'r'],
      filas: tr.map((x) => [x.nombre_comercial, n0(x.viajes_realizados), n2(x.tn_despacho), n2(x.tn_final), pct(x.tn_final / totTr)]),
      total: ['TOTAL', n0(tr.reduce((s, x) => s + x.viajes_realizados, 0)), n2(tr.reduce((s, x) => s + x.tn_despacho, 0)), n2(totTr), '100,0 %'] });
  }
  if (graf.tiempos) S.push({ tipo: 'grafico', titulo: 'Tiempo de atención en puerto', sub: 'Viajes por rango de tiempo y día', img: graf.tiempos });
  S.push({ tipo: 'tabla', titulo: 'Balance de la operación', cols: ['Concepto', 'TN'], alin: ['l', 'r'], filas: [
    ['Cantidad despachada en planta (Huacho)', n2(t.tn_despacho)], ['Cantidad rechazada / devuelta', n2(t.tn_devueltas)], ['Cantidad acopiada en puerto (CSPCP)', n2(t.tn_acopio)],
    ['Diferencia peso puerto − planta', n2(t.diferencia_acopio_despacho)], ['Cantidad embarcada', n2(t.tn_embarque)], ['Diferencia embarque − acopio', n2(t.dif_embarque_acopio)],
    ['Cantidad embarcada según draft SGS', n2(t.tn_draft_sgs)], ['Diferencia draft SGS − embarque', n2(t.dif_draft_embarque)]] });
  const etapas = e.etapas.filter((x) => x.inicio || x.fin);
  if (etapas.length || e.reportes.length) {
    S.push({ tipo: 'tabla', titulo: 'Proceso de embarque', cols: ['Etapa / reporte', 'Inicio', 'Fin', 'TN', 'TN / hora'], alin: ['l', 'l', 'l', 'r', 'r'],
      filas: [...etapas.map((x) => [x.nombre, fechaHora(x.inicio), fechaHora(x.fin), '', '']),
        ...e.reportes.map((r) => [`${r.numero}° reporte`, fechaHora(r.inicio), fechaHora(r.fin), n2(r.tn_parcial), n2(r.tn_x_hora)])],
      total: ['TN embarcadas', '', '', n2(e.tn_embarcadas), ''] });
  }
  // Registro fotográfico: 1 foto por diapositiva (hasta 6) o 2 por diapositiva si son más
  if (fotos.length) {
    const porDiapo = fotos.length > 6 ? 2 : 1, grupos = [];
    for (let k = 0; k < fotos.length; k += porDiapo) grupos.push(fotos.slice(k, k + porDiapo));
    grupos.forEach((g, k) => S.push({ tipo: 'fotos', titulo: 'Registro fotográfico', sub: grupos.length > 1 ? `${k + 1} de ${grupos.length}` : '', fotos: g }));
  }
  S.push({ tipo: 'cierre', titulo: 'Operación finalizada', lineas: [`${op.nave} · ORDEN ${op.orden}`, `${n2(t.tn_acopio)} TN acopiadas en ${n0(t.viajes)} viajes`, op.coordinador ? `Coordinador de transporte: ${op.coordinador}` : '', (op.empresa || '').trim()].filter(Boolean) });
  return S;
}
const fechaHora = (s) => (s ? `${fecha(s)} ${String(s).slice(11, 16)}` : '—');

/* ===================== Renderizado en canvas (HTML y video) ===================== */
const W = 1920, H = 1080;
function texto(ctx, s, x, y, { size = 40, bold = false, color = '#17212f', align = 'left', max = 0 } = {}) {
  ctx.font = `${bold ? '700' : '400'} ${size}px "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  let t = String(s ?? '');
  if (max) while (t.length > 3 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  ctx.fillText(t, x, y);
}
function caja(ctx, x, y, w, h, color, r = 18) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

function pintarDiapositiva(ctx, s, i, total, op, logo, imgs) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (s.tipo === 'portada' || s.tipo === 'cierre') {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, AZUL); g.addColorStop(1, AZUL2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (logo) { caja(ctx, 120, 110, 300, 170, '#fff', 16); ctx.drawImage(logo, 135, 122, 270, 146); }
    texto(ctx, (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim(), 460, 215, { size: 44, bold: true, color: '#fff' });
    texto(ctx, s.titulo, 120, 470, { size: 92, bold: true, color: '#fff' });
    if (s.sub) texto(ctx, s.sub, 120, 570, { size: 64, color: '#FFD9A8', bold: true });
    s.lineas.forEach((l, k) => texto(ctx, l, 120, (s.sub ? 680 : 580) + k * 64, { size: 36, color: '#E6EEF8', max: W - 240 }));
    return;
  }
  ctx.fillStyle = AZUL; ctx.fillRect(0, 0, W, 150);
  texto(ctx, s.titulo, 80, 98, { size: 58, bold: true, color: '#fff' });
  if (logo) { caja(ctx, W - 290, 22, 220, 108, '#fff', 10); ctx.drawImage(logo, W - 280, 28, 200, 96); }
  ctx.fillStyle = NARANJA; ctx.fillRect(0, 150, W, 8);
  texto(ctx, `${(op.empresa || '').trim()} · ${op.nave} · Orden ${op.orden}`, 80, H - 40, { size: 26, color: GRIS });
  texto(ctx, `${i + 1} / ${total}`, W - 80, H - 40, { size: 26, color: GRIS, align: 'right' });
  if (s.sub) texto(ctx, s.sub, 80, 225, { size: 34, color: GRIS });
  if (s.tipo === 'kpis') {
    const cw = 560, ch = 230, gx = 50, gy = 40, x0 = (W - (3 * cw + 2 * gx)) / 2, y0 = 230;
    s.kpis.forEach(([l, v], k) => {
      const x = x0 + (k % 3) * (cw + gx), y = y0 + Math.floor(k / 3) * (ch + gy);
      caja(ctx, x, y, cw, ch, CLARO); ctx.fillStyle = k < 3 ? AZUL2 : NARANJA; ctx.fillRect(x, y + 20, 10, ch - 40);
      texto(ctx, l.toUpperCase(), x + 45, y + 75, { size: 28, color: GRIS, bold: true, max: cw - 70 });
      texto(ctx, v, x + 45, y + 175, { size: 72, bold: true, color: '#17212f', max: cw - 70 });
    });
  } else if (s.tipo === 'fotos') {
    // fotos ajustadas a su recuadro (sin recortar), con marco redondeado y su descripción debajo
    const n = s.fotos.length, gap = 50, y0 = 250, alto = H - y0 - 150, ancho = (W - 160 - gap * (n - 1)) / n;
    s.fotos.forEach((f, k) => {
      const im = imgs[f.src]; if (!im) return;
      const bx = 80 + k * (ancho + gap), hDesc = f.desc ? 60 : 0;
      const esc = Math.min(ancho / im.width, (alto - hDesc) / im.height), w = im.width * esc, h = im.height * esc;
      const x = bx + (ancho - w) / 2, y = y0 + (alto - hDesc - h) / 2;
      ctx.save(); ctx.shadowColor = 'rgba(15,27,45,.28)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; caja(ctx, x - 8, y - 8, w + 16, h + 16, '#fff', 20); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.clip(); ctx.drawImage(im, x, y, w, h); ctx.restore();
      if (f.desc) texto(ctx, f.desc, bx + ancho / 2, y + h + 56, { size: 32, color: '#17212f', bold: true, align: 'center', max: ancho });
    });
  } else if (s.tipo === 'grafico' && imgs[s.img]) {
    const im = imgs[s.img]; const maxW = W - 160, maxH = H - 340; const k = Math.min(maxW / im.width, maxH / im.height);
    ctx.drawImage(im, (W - im.width * k) / 2, 260, im.width * k, im.height * k);
  } else if (s.tipo === 'tabla') {
    const conImg = s.img && imgs[s.img];
    const tx = 80, tw = conImg ? 1120 : W - 160;
    const nfil = s.filas.length + 1 + (s.total ? 1 : 0);
    const rh = Math.min(78, (H - 330) / nfil);
    let fs = Math.max(20, Math.min(34, rh * 0.45));
    // Ancho de columnas según el contenido; si no entra, se reduce la letra
    const medir = (tam) => s.cols.map((c, k) => Math.max(...[c, ...s.filas.map((f) => f[k]), ...(s.total ? [s.total[k]] : [])].map((v) => {
      ctx.font = `700 ${tam}px "Segoe UI", Roboto, Arial, sans-serif`; return ctx.measureText(String(v ?? '')).width; })) + 40);
    let anchos = medir(fs);
    while (anchos.reduce((a, b) => a + b, 0) > tw && fs > 16) { fs -= 1; anchos = medir(fs); }
    const sobra = tw - anchos.reduce((a, b) => a + b, 0);
    anchos = anchos.map((a, k) => (k === 0 ? a + Math.max(0, sobra) : a));
    let y = 220;
    const fila = (vals, estilo) => {
      if (estilo === 'head') caja(ctx, tx, y, tw, rh, AZUL, 8); else if (estilo === 'total') caja(ctx, tx, y, tw, rh, '#E6EEF8', 8);
      let x = tx;
      vals.forEach((v, c) => {
        const al = s.alin[c] === 'r' ? 'right' : 'left';
        texto(ctx, v, al === 'right' ? x + anchos[c] - 18 : x + 18, y + rh * 0.66, { size: fs, bold: estilo !== 'body', color: estilo === 'head' ? '#fff' : '#17212f', align: al, max: anchos[c] - 30 });
        x += anchos[c];
      });
      if (estilo === 'body') { ctx.fillStyle = '#e2e7ee'; ctx.fillRect(tx, y + rh - 2, tw, 2); }
      y += rh;
    };
    fila(s.cols, 'head');
    s.filas.forEach((f) => fila(f, 'body'));
    if (s.total) fila(s.total, 'total');
    if (conImg) { const im = imgs[s.img]; const k = Math.min(600 / im.width, (H - 330) / im.height); ctx.drawImage(im, W - 80 - im.width * k, 230, im.width * k, im.height * k); }
  }
}

async function prepararImagenes(slides) {
  const imgs = {};
  for (const s of slides) {
    if (s.img && !imgs[s.img]) imgs[s.img] = await imagen(s.img);
    for (const f of s.fotos || []) if (!imgs[f.src]) imgs[f.src] = await imagen(f.src);
  }
  const lg = await logoBase64();
  return { imgs, logo: lg ? await imagen(lg) : null };
}

/** Cada diapositiva como imagen (JPEG). */
export async function imagenesDiapositivas(slides, op) {
  const { imgs, logo } = await prepararImagenes(slides);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  return slides.map((s, i) => { pintarDiapositiva(ctx, s, i, slides.length, op, logo, imgs); return c.toDataURL('image/jpeg', 0.88); });
}

/* ===================== HTML autónomo ===================== */
export function htmlPresentacion(op, imagenes) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`Presentación · ${op.nave} · Orden ${op.orden}`)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0f1520;color:#e6ecf3;font-family:system-ui,"Segoe UI",Roboto,Arial,sans-serif}
.app{display:flex;flex-direction:column;height:100%}.esc{flex:1;display:grid;place-items:center;padding:12px;min-height:0}
.esc img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.5);display:none}.esc img.on{display:block}
.bar{display:flex;gap:8px;align-items:center;justify-content:center;padding:10px;flex-wrap:wrap}
button{font:inherit;font-weight:600;background:#1c2839;color:#e6ecf3;border:1px solid #2a384d;border-radius:8px;padding:8px 14px;cursor:pointer}button:hover{background:#23405f}
.dots{display:flex;gap:6px}.dots i{width:10px;height:10px;border-radius:50%;background:#2a384d;cursor:pointer}.dots i.on{background:#5b9be0}
@media print{.bar{display:none}.esc{display:block;padding:0}.esc img{display:block!important;page-break-after:always;max-height:none;width:100%;box-shadow:none;border-radius:0}body{background:#fff}}
</style></head><body><div class="app"><div class="esc" id="esc">${imagenes.map((src, i) => `<img src="${src}" alt="Diapositiva ${i + 1}"${i ? '' : ' class="on"'}>`).join('')}</div>
<div class="bar"><button id="ant" aria-label="Anterior">◀</button><span id="num">1 / ${imagenes.length}</span><button id="sig" aria-label="Siguiente">▶</button>
<div class="dots" id="dots">${imagenes.map((_, i) => `<i data-i="${i}"${i ? '' : ' class="on"'}></i>`).join('')}</div>
<button id="auto">▶ Reproducir</button><button id="full">Pantalla completa</button><button onclick="print()">Imprimir</button></div></div>
<script>
const im=[...document.querySelectorAll('#esc img')],ds=[...document.querySelectorAll('#dots i')];let i=0,t=null;
function ir(n){i=(n+im.length)%im.length;im.forEach((x,k)=>x.classList.toggle('on',k===i));ds.forEach((x,k)=>x.classList.toggle('on',k===i));document.getElementById('num').textContent=(i+1)+' / '+im.length}
document.getElementById('ant').onclick=()=>ir(i-1);document.getElementById('sig').onclick=()=>ir(i+1);
ds.forEach(d=>d.onclick=()=>ir(+d.dataset.i));
document.getElementById('auto').onclick=e=>{if(t){clearInterval(t);t=null;e.target.textContent='▶ Reproducir'}else{t=setInterval(()=>ir(i+1),5000);e.target.textContent='❚❚ Pausa'}};
document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')ir(i+1);if(e.key==='ArrowLeft')ir(i-1)});
</script></body></html>`;
  return new Blob([html], { type: 'text/html' });
}

/* ===================== Video (grabación del canvas) ===================== */
export function formatoVideo() {
  const tipos = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const t = tipos.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
  return t ? { mime: t, ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}
/** Graba un video con las diapositivas (segundos por diapositiva, con transición). Tarda lo que dura el video. */
export async function videoPresentacion(imagenes, { segundos = 5, alProgreso } = {}) {
  const fmt = formatoVideo();
  if (!fmt) throw new Error('Este navegador no permite grabar video. Use Chrome o Edge actualizados.');
  const imgs = await Promise.all(imagenes.map(imagen));
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 4_000_000 });
  const partes = [];
  rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  const fin = new Promise((res) => { rec.onstop = res; });
  const dur = segundos * 1000, trans = 600, total = dur * imgs.length;
  const dibujar = (ms) => {
    const k = Math.min(imgs.length - 1, Math.floor(ms / dur));
    const dentro = ms - k * dur;
    ctx.globalAlpha = 1; ctx.drawImage(imgs[k], 0, 0, 1280, 720);
    if (k > 0 && dentro < trans) { ctx.globalAlpha = 1 - dentro / trans; ctx.drawImage(imgs[k - 1], 0, 0, 1280, 720); ctx.globalAlpha = 1; }
  };
  dibujar(0);
  rec.start(1000);
  const t0 = performance.now();
  await new Promise((res) => {
    const paso = () => {
      const ms = performance.now() - t0;
      dibujar(Math.min(ms, total - 1));
      alProgreso?.(Math.min(1, ms / total));
      if (ms >= total) return res();
      setTimeout(paso, 1000 / 30);
    };
    paso();
  });
  rec.stop();
  await fin;
  stream.getTracks().forEach((tr) => tr.stop());
  return { blob: new Blob(partes, { type: fmt.mime.split(';')[0] }), ext: fmt.ext };
}

/* ===================== PowerPoint (editable) ===================== */
export async function pptxPresentacion(slides, op) {
  await cargarScript('vendor/pptxgen.bundle.js');
  const P = new window.PptxGenJS();
  P.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  P.author = (op.empresa || '').trim(); P.company = (op.empresa || '').trim(); P.title = `${op.nave} · Orden ${op.orden}`;
  const logo = await logoBase64();
  const hex = (c) => c.replace('#', '');
  slides.forEach((s, i) => {
    const sl = P.addSlide();
    if (s.tipo === 'portada' || s.tipo === 'cierre') {
      sl.background = { color: hex(AZUL) };
      if (logo) { sl.addShape(P.ShapeType.roundRect, { x: 0.8, y: 0.7, w: 2.1, h: 1.2, fill: { color: 'FFFFFF' }, rectRadius: 0.1 }); sl.addImage({ data: logo, x: 0.9, y: 0.78, w: 1.9, h: 1.04 }); }
      sl.addText((op.empresa || '').trim(), { x: 3.1, y: 0.95, w: 9, h: 0.7, fontSize: 24, bold: true, color: 'FFFFFF' });
      sl.addText(s.titulo, { x: 0.8, y: 2.5, w: 11.8, h: 1, fontSize: 48, bold: true, color: 'FFFFFF' });
      if (s.sub) sl.addText(s.sub, { x: 0.8, y: 3.5, w: 11.8, h: 0.8, fontSize: 32, bold: true, color: 'FFD9A8' });
      sl.addText(s.lineas.map((l) => ({ text: l, options: { breakLine: true } })), { x: 0.8, y: s.sub ? 4.4 : 3.6, w: 11.8, h: 2.4, fontSize: 20, color: 'E6EEF8', valign: 'top' });
      return;
    }
    sl.background = { color: 'FFFFFF' };
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.95, fill: { color: hex(AZUL) } });
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0.95, w: 13.33, h: 0.06, fill: { color: hex(NARANJA) } });
    sl.addText(s.titulo, { x: 0.5, y: 0.12, w: 10.5, h: 0.72, fontSize: 28, bold: true, color: 'FFFFFF' });
    if (logo) sl.addImage({ data: logo, x: 11.75, y: 0.12, w: 1.25, h: 0.7 });
    sl.addText(`${(op.empresa || '').trim()} · ${op.nave} · Orden ${op.orden}`, { x: 0.5, y: 7.05, w: 10, h: 0.3, fontSize: 10, color: hex(GRIS) });
    sl.addText(`${i + 1} / ${slides.length}`, { x: 11.8, y: 7.05, w: 1, h: 0.3, fontSize: 10, color: hex(GRIS), align: 'right' });
    if (s.sub) sl.addText(s.sub, { x: 0.5, y: 1.1, w: 12, h: 0.45, fontSize: 16, color: hex(GRIS) });
    if (s.tipo === 'kpis') {
      s.kpis.forEach(([l, v], k) => {
        const x = 0.75 + (k % 3) * 4.0, y = 1.45 + Math.floor(k / 3) * 1.8;
        sl.addShape(P.ShapeType.roundRect, { x, y, w: 3.75, h: 1.55, fill: { color: 'F4F6F9' }, rectRadius: 0.08 });
        sl.addShape(P.ShapeType.rect, { x, y: y + 0.15, w: 0.07, h: 1.25, fill: { color: hex(k < 3 ? AZUL2 : NARANJA) } });
        sl.addText(l.toUpperCase(), { x: x + 0.25, y: y + 0.15, w: 3.4, h: 0.45, fontSize: 12, bold: true, color: hex(GRIS) });
        sl.addText(v, { x: x + 0.25, y: y + 0.6, w: 3.4, h: 0.8, fontSize: 30, bold: true, color: '17212F' });
      });
    } else if (s.tipo === 'fotos') {
      const n = s.fotos.length, gap = 0.4, y0 = 1.6, alto = 5.2, ancho = (12.33 - gap * (n - 1)) / n;
      s.fotos.forEach((f, k) => {
        const bx = 0.5 + k * (ancho + gap), hDesc = f.desc ? 0.45 : 0;
        const esc = Math.min(ancho / f.w, (alto - hDesc) / f.h), w = f.w * esc, h = f.h * esc;
        const x = bx + (ancho - w) / 2, y = y0 + (alto - hDesc - h) / 2;
        sl.addImage({ data: f.src, x, y, w, h, rounding: false });
        if (f.desc) sl.addText(f.desc, { x: bx, y: y + h + 0.05, w: ancho, h: 0.4, fontSize: 14, bold: true, color: '17212F', align: 'center' });
      });
    } else if (s.tipo === 'grafico') {
      sl.addImage({ data: s.img, x: 0.9, y: 1.6, w: 11.5, h: 11.5 * (760 / 1600) });
    } else if (s.tipo === 'tabla') {
      const conImg = !!s.img;
      const head = s.cols.map((c, k) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: hex(AZUL) }, align: s.alin[k] === 'r' ? 'right' : 'left' } }));
      const body = s.filas.map((f) => f.map((v, k) => ({ text: String(v), options: { align: s.alin[k] === 'r' ? 'right' : 'left' } })));
      const tot = s.total ? [s.total.map((v, k) => ({ text: String(v), options: { bold: true, fill: { color: 'E6EEF8' }, align: s.alin[k] === 'r' ? 'right' : 'left' } }))] : [];
      const w = conImg ? 7.2 : 12.3;
      const n = s.filas.length + 1 + tot.length;
      sl.addTable([head, ...body, ...tot], { x: 0.5, y: 1.25, w, fontSize: n > 12 ? 10 : 13, rowH: Math.min(0.42, 5.6 / n), border: { type: 'solid', pt: 0.5, color: 'E2E7EE' },
        colW: s.cols.map((_, k) => (k === 0 ? w * (s.cols.length > 2 ? 0.4 : 0.7) : (w * (s.cols.length > 2 ? 0.6 : 0.3)) / (s.cols.length - 1))) });
      if (conImg) sl.addImage({ data: s.img, x: 8.0, y: 1.35, w: 4.9, h: 4.9 * (700 / 800) });
    }
  });
  return P.write({ outputType: 'blob' });
}
