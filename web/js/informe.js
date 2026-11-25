// Informe para el cliente (operación finalizada): análisis completo de la operación en
// PDF, PowerPoint (también para importar en Canva) y video animado con música.
// Todo se genera en el navegador a partir del tablero de la operación.
import { logoBase64 } from './excel.js?v=__V__';

const W = 1920, H = 1080;
const C = { bg1: '#050b18', bg2: '#0b1e3f', txt: '#f1f5f9', mut: '#94a3b8', card: 'rgba(255,255,255,0.06)', borde: 'rgba(255,255,255,0.12)',
  azul: '#3b82f6', cian: '#22d3ee', verde: '#34d399', violeta: '#a78bfa', naranja: '#fb923c', rosa: '#f472b6', ambar: '#fbbf24', rojo: '#f87171' };
const SERIE = [C.azul, C.naranja, C.verde, C.violeta, C.cian, C.rosa, C.ambar, C.rojo];
const FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';
const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = (v) => (v == null || isNaN(v) ? '—' : nf(0).format(v));
const n1 = (v) => (v == null || isNaN(v) ? '—' : nf(1).format(v));
const n3 = (v) => (v == null || isNaN(v) ? '—' : nf(3).format(v));
const fecha = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`);
const ms = (s) => (s ? new Date(String(s).replace(' ', 'T')).getTime() : null);
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const fase = (p, a, b) => ease((p - a) / (b - a));

/* ===================== Análisis de la operación ===================== */
export function analizar(d) {
  const op = d.operacion, t = d.totales;
  const tr = (d.transportistas || []).filter((x) => x.viajes_realizados).sort((a, b) => b.tn_final - a.tn_final);
  const totTr = tr.reduce((s, x) => s + x.tn_final, 0) || 1;
  const jd = d.jornadas.despacho || [], ja = d.jornadas.acopio || [];
  const mejor = (fs) => fs.reduce((m, x) => (!m || x.tn > m.tn ? x : m), null);
  const ra = (d.reportes_acopio || []).filter((r) => r.tn_total != null), rdp = (d.reportes_despacho || []).filter((r) => r.tn_total != null);
  const ultA = ra[ra.length - 1], ultD = rdp[rdp.length - 1];
  const R = ['<=30 MIN', '>30 MIN - <1 HR', '>=1 HR'];
  const tt = (d.tiempos || []).reduce((a, x) => { R.forEach((r) => { a[r] = (a[r] || 0) + (x[r] || 0); }); a.total = (a.total || 0) + (x.total || 0); return a; }, {});
  const ini = d.resumen?.inicio_acopio || jd[0]?.fecha, fin = d.resumen?.fin_acopio || ja[ja.length - 1]?.fecha;
  const dias = ini && fin ? Math.max(1, Math.round((ms(fin) - ms(ini)) / 86400000) + 1) : null;
  const u = d.unidades || {};
  const unidMax = (u.unidades || [])[0];
  const prog = t.tn_programadas || 0;
  const cumpl = prog ? t.tn_acopio / prog : null;
  const lider = tr[0];
  const p30 = tt.total ? (tt[R[0]] || 0) / tt.total : null;
  const difPct = t.tn_despacho ? (t.diferencia_acopio_despacho || 0) / t.tn_despacho : null;
  const A = {
    op, t, tr, totTr, jd, ja, R, tt, dias, ini, fin, cumpl, lider, p30, difPct, u, unidMax, ra, rdp,
    mejorD: mejor(jd), mejorA: mejor(ja),
    tphA: ultA?.horas_total ? ultA.tn_total / ultA.horas_total : null, tphD: ultD?.horas_total ? ultD.tn_total / ultD.horas_total : null,
    vph: ultA?.horas_total ? ultA.viajes_total / ultA.horas_total : null, horasA: ultA?.horas_total || null,
    viajesUnidad: u.unidades_activas ? (u.total_viajes || t.viajes) / u.unidades_activas : null,
  };
  // Hallazgos y recomendaciones automáticas
  const H = [], Rc = [];
  if (cumpl != null) H.push(`Se acopió el ${n1(cumpl * 100)} % de lo programado: ${n3(t.tn_acopio)} de ${n3(prog)} TN.`);
  if (dias) H.push(`La operación se completó en ${dias} días (${fecha(ini)} – ${fecha(fin)})${A.horasA ? `, con ${n0(A.horasA)} horas de acopio` : ''}.`);
  if (A.tphA) H.push(`Ritmo promedio de acopio: ${n0(A.tphA)} TN por hora y ${n1(A.vph)} viajes por hora.`);
  if (A.mejorA) H.push(`Jornada más productiva en puerto: ${fecha(A.mejorA.fecha)} ${A.mejorA.jornada}, con ${n3(A.mejorA.tn)} TN en ${A.mejorA.viajes} viajes.`);
  if (lider) H.push(`${lider.nombre_comercial} lideró el transporte con el ${n1((lider.tn_final / totTr) * 100)} % de las toneladas (${n0(lider.viajes_realizados)} viajes).`);
  if (A.viajesUnidad) H.push(`${n0(u.unidades_activas)} unidades realizaron ${n1(A.viajesUnidad)} viajes en promedio${unidMax ? `; la más activa (${unidMax.placa}) hizo ${unidMax.viajes}` : ''}.`);
  if (p30 != null) H.push(`El ${n1(p30 * 100)} % de las unidades fue atendido en puerto en 30 minutos o menos (promedio ${hm(t.tiempo_prom_min)} h).`);
  if (difPct != null) H.push(`Diferencia de peso puerto − planta: ${n3(t.diferencia_acopio_despacho)} TN (${n1(difPct * 100)} % del despacho).`);
  if (cumpl != null && cumpl >= 1) Rc.push('Meta cumplida: replicar la planificación de unidades y jornadas en las próximas naves.');
  else if (cumpl != null) Rc.push('Revisar la asignación de unidades por vuelta para cerrar la brecha con lo programado.');
  if (p30 != null && p30 < 0.7) Rc.push('Reforzar la atención en puerto (ingreso y descarga) en las jornadas con más de 30 minutos de espera.');
  else if (p30 != null) Rc.push('Mantener el esquema de atención en puerto: la mayoría de unidades se atiende en menos de 30 minutos.');
  if (lider && lider.tn_final / totTr > 0.6) Rc.push(`Diversificar la flota: ${lider.nombre_comercial} concentra más del 60 % de las toneladas.`);
  if (difPct != null && Math.abs(difPct) > 0.005) Rc.push('Verificar la calibración de balanzas entre planta y puerto (diferencia mayor a 0.5 %).');
  else if (difPct != null) Rc.push('El control de pesos entre planta y puerto se mantuvo dentro de márgenes mínimos.');
  A.hallazgos = H; A.recomendaciones = Rc;
  return A;
}

/* ===================== Gráficos (Chart.js, tema oscuro, fondo transparente) ===================== */
function grafico(config, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  Chart.defaults.color = '#cbd5e1'; Chart.defaults.borderColor = 'rgba(255,255,255,0.1)'; Chart.defaults.font.family = FONT;
  const ch = new Chart(cv.getContext('2d'), { ...config, options: { responsive: false, animation: false, devicePixelRatio: 1, ...config.options,
    plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0', font: { size: 20, weight: '600' }, usePointStyle: true, boxWidth: 14, padding: 22 } }, ...(config.options?.plugins || {}) },
    scales: Object.fromEntries(Object.entries(config.options?.scales ?? { x: {}, y: {} }).map(([k, v]) => [k, { grid: { color: 'rgba(255,255,255,0.08)' }, ...v, ticks: { color: '#cbd5e1', font: { size: 18 }, ...(v.ticks || {}) } }])) } });
  const copia = document.createElement('canvas'); copia.width = w; copia.height = h; copia.getContext('2d').drawImage(cv, 0, 0);
  ch.destroy();
  return copia;
}
function graficos(A) {
  const g = {};
  const n = Math.max(A.rdp.length, A.ra.length);
  if (n) g.avance = grafico({ type: 'line', data: { labels: Array.from({ length: n }, (_, i) => `R${i + 1}`), datasets: [
    { label: 'Despacho Huacho', data: A.rdp.map((r) => r.tn_total), borderColor: C.azul, backgroundColor: 'rgba(59,130,246,0.18)', fill: true, borderWidth: 5, pointRadius: 7, tension: 0.35 },
    { label: 'Acopio CSPCP', data: A.ra.map((r) => r.tn_total), borderColor: C.naranja, backgroundColor: 'rgba(251,146,60,0.12)', fill: true, borderWidth: 5, pointRadius: 7, tension: 0.35 },
    { label: 'Programado', data: Array(n).fill(A.t.tn_programadas), borderColor: '#94a3b8', borderDash: [12, 10], pointRadius: 0, borderWidth: 3 }] },
  options: { scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } } }, 1100, 620);
  const J = ['23:00 - 07:00', '07:00 - 16:00', '16:00 - 23:00'], dias = [...new Set(A.ja.map((x) => x.fecha))];
  if (dias.length) g.jornadas = grafico({ type: 'bar', data: { labels: dias.map(fecha), datasets: J.map((j, i) => ({ label: j, backgroundColor: [C.azul, C.ambar, C.violeta][i], borderRadius: 8,
    data: dias.map((f) => A.ja.find((x) => x.fecha === f && x.jornada === j)?.tn || 0) })) }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } } }, 1100, 620);
  const dist = [...(A.u.distribucion || [])].sort((a, b) => a.vueltas - b.vueltas);
  if (dist.length) g.vueltas = grafico({ type: 'bar', data: { labels: dist.map((x) => `${x.vueltas}ª`), datasets: [{ label: 'Unidades', data: dist.map((x) => x.cantidad), backgroundColor: C.cian, borderRadius: 8 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } }, 1000, 560);
  if (A.tt.total) g.rangos = grafico({ type: 'doughnut', data: { labels: A.R, datasets: [{ data: A.R.map((r) => A.tt[r] || 0), backgroundColor: [C.verde, C.ambar, C.rojo], borderWidth: 0 }] },
    options: { cutout: '68%', scales: {}, plugins: { legend: { position: 'bottom' } } } }, 620, 620);
  return g;
}

/* ===================== Diapositivas ===================== */
export function diapositivas(A) {
  const op = A.op, t = A.t;
  const S = [];
  S.push({ id: 'portada', notas: `Informe de la operación ${op.nave} · Orden ${op.orden}. ${A.hallazgos[0] || ''}` });
  S.push({ id: 'cifras', titulo: 'La operación en cifras', eyebrow: 'RESUMEN', notas: A.hallazgos.slice(0, 3).join(' ') });
  S.push({ id: 'cumplimiento', titulo: 'Cumplimiento de la meta', eyebrow: 'RESULTADO', notas: A.hallazgos[0] || '' });
  if (A.rdp.length || A.ra.length) S.push({ id: 'avance', titulo: 'Avance de la operación', eyebrow: 'EVOLUCIÓN POR REPORTE', notas: A.hallazgos[2] || '' });
  if (A.ja.length) S.push({ id: 'jornadas', titulo: 'Producción por jornada', eyebrow: 'ACOPIO EN PUERTO', notas: A.hallazgos[3] || '' });
  if (A.tr.length) S.push({ id: 'transportistas', titulo: 'Desempeño de transportistas', eyebrow: 'FLOTA', notas: A.hallazgos[4] || '' });
  if (A.u.unidades_activas) S.push({ id: 'flota', titulo: 'Rotación de unidades', eyebrow: 'VUELTAS', notas: A.hallazgos[5] || '' });
  if (A.tt.total) S.push({ id: 'puerto', titulo: 'Atención en puerto', eyebrow: 'TIEMPOS', notas: A.hallazgos[6] || '' });
  S.push({ id: 'balance', titulo: 'Balance y control de pesos', eyebrow: 'TRAZABILIDAD', notas: A.hallazgos[7] || '' });
  S.push({ id: 'hallazgos', titulo: 'Hallazgos y recomendaciones', eyebrow: 'ANÁLISIS', notas: [...A.hallazgos, ...A.recomendaciones].join(' ') });
  // Registro fotográfico (fotos cargadas al generar el informe): 1 por diapositiva hasta 6, si no 2
  const F = A.fotos || [];
  if (F.length) {
    const por = F.length > 6 ? 2 : 1, n = Math.ceil(F.length / por);
    for (let k = 0; k < n; k++) S.push({ id: 'fotos', titulo: 'Registro fotográfico', eyebrow: n > 1 ? `EN CAMPO · ${k + 1} DE ${n}` : 'EN CAMPO',
      fotos: F.slice(k * por, k * por + por), notas: F.slice(k * por, k * por + por).map((f) => f.desc).filter(Boolean).join('. ') });
  }
  S.push({ id: 'cierre', notas: 'Gracias.' });
  void t;
  return S;
}

/* ---------- utilidades de dibujo ---------- */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function txt(ctx, s, x, y, { size = 40, peso = 700, color = C.txt, align = 'left', max = 0, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${peso} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  let t = String(s ?? ''); if (max) while (t.length > 3 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  ctx.fillText(t, x, y); ctx.restore();
}
function parrafo(ctx, s, x, y, w, { size = 30, lh = 1.4, color = C.txt, peso = 500, alpha = 1 } = {}) {
  ctx.save(); ctx.font = `${peso} ${size}px ${FONT}`; const pal = String(s).split(' '); let l = '', yy = y;
  for (const p of pal) { const prueba = l ? `${l} ${p}` : p; if (ctx.measureText(prueba).width > w && l) { txt(ctx, l, x, yy, { size, peso, color, alpha }); l = p; yy += size * lh; } else l = prueba; }
  if (l) txt(ctx, l, x, yy, { size, peso, color, alpha }); ctx.restore(); return yy + size * lh;
}
function fondo(ctx, k = 0) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(W * 0.85 + Math.sin(k) * 30, H * 0.1, 700, 'rgba(34,211,238,0.16)');
  blob(W * 0.1, H * 0.95 + Math.cos(k) * 30, 760, 'rgba(167,139,250,0.16)');
  blob(W * 0.5, H * 0.5, 900, 'rgba(37,99,235,0.08)');
}
function tarjeta(ctx, x, y, w, h, { acento = null, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; rr(ctx, x, y, w, h, 28); ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.borde; ctx.lineWidth = 2; ctx.stroke();
  if (acento) { const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, acento); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; rr(ctx, x, y, w, 6, 3); ctx.fill(); }
  ctx.restore();
}
function encabezado(ctx, s, i, total, op, logo, p) {
  const a = fase(p, 0, 0.25);
  txt(ctx, s.eyebrow, 110, 150, { size: 26, peso: 800, color: C.cian, alpha: a });
  txt(ctx, s.titulo, 110 - (1 - a) * 40, 225, { size: 72, peso: 800, alpha: a });
  ctx.save(); ctx.globalAlpha = a; const g = ctx.createLinearGradient(110, 0, 410, 0); g.addColorStop(0, C.azul); g.addColorStop(1, C.cian); ctx.fillStyle = g; rr(ctx, 110, 250, 300 * a, 8, 4); ctx.fill(); ctx.restore();
  if (logo) { ctx.save(); ctx.globalAlpha = 0.95; rr(ctx, W - 300, 70, 200, 110, 18); ctx.fillStyle = '#fff'; ctx.fill(); ctx.drawImage(logo, W - 290, 78, 180, 94); ctx.restore(); }
  txt(ctx, `${(op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim()} · ${op.nave} · Orden ${op.orden}`, 110, H - 55, { size: 22, peso: 600, color: C.mut });
  txt(ctx, `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, W - 110, H - 55, { size: 22, peso: 700, color: C.mut, align: 'right' });
}
function kpi(ctx, x, y, w, h, l, valor, fmt, sub, col, p, d0 = 0) {
  const a = fase(p, d0, d0 + 0.3);
  tarjeta(ctx, x, y + (1 - a) * 30, w, h, { acento: col, alpha: a });
  txt(ctx, l.toUpperCase(), x + 36, y + 70 + (1 - a) * 30, { size: 22, peso: 800, color: C.mut, alpha: a, max: w - 60 });
  const v = typeof valor === 'number' ? fmt(valor * fase(p, d0, d0 + 0.55)) : valor;
  txt(ctx, v, x + 36, y + 150 + (1 - a) * 30, { size: 62, peso: 800, alpha: a, max: w - 60 });
  if (sub) txt(ctx, sub, x + 36, y + 200 + (1 - a) * 30, { size: 22, peso: 600, color: col, alpha: a, max: w - 60 });
}
function revelar(ctx, im, x, y, w, h, p, d0 = 0.15) {
  if (!im) return; const a = fase(p, d0, d0 + 0.5);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w * a, h); ctx.clip(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.drawImage(im, x, y, w, h); ctx.restore();
}
function barra(ctx, x, y, w, h, frac, col, p, d0 = 0.1) {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  const f = Math.max(0, Math.min(1, frac)) * fase(p, d0, d0 + 0.5); if (f <= 0) return;
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, col); g.addColorStop(1, C.cian); rr(ctx, x, y, Math.max(h, w * f), h, h / 2); ctx.fillStyle = g; ctx.fill();
}

/** Dibuja la diapositiva s con avance de animación p (0→1; 1 = estática). */
function pintar(ctx, s, i, total, A, G, logo, p) {
  const op = A.op, t = A.t;
  fondo(ctx, p * 2 + i);
  if (s.id === 'portada' || s.id === 'cierre') {
    const a = fase(p, 0, 0.3);
    if (logo) { ctx.save(); ctx.globalAlpha = a; rr(ctx, 110, 110, 300, 160, 24); ctx.fillStyle = '#fff'; ctx.fill(); ctx.drawImage(logo, 125, 120, 270, 140); ctx.restore(); }
    txt(ctx, (op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim(), 450, 205, { size: 34, peso: 700, color: '#cbd5e1', alpha: a });
    if (s.id === 'portada') {
      txt(ctx, 'INFORME DE OPERACIÓN', 110, 420, { size: 34, peso: 800, color: C.cian, alpha: fase(p, 0.1, 0.35) });
      txt(ctx, `${op.nave}`, 110 - (1 - fase(p, 0.15, 0.45)) * 60, 540, { size: 120, peso: 900, alpha: fase(p, 0.15, 0.45), max: W - 220 });
      txt(ctx, `ORDEN ${op.orden} · ${op.cliente || ''}`, 110, 615, { size: 40, peso: 700, color: '#bae6fd', alpha: fase(p, 0.25, 0.5), max: W - 220 });
      txt(ctx, `${op.producto || 'SAL A GRANEL'} · ${op.punto_salida || 'Salinas Huacho'} → ${op.punto_llegada || 'Puerto CSPCP'}`, 110, 675, { size: 28, peso: 500, color: C.mut, alpha: fase(p, 0.3, 0.55), max: W - 220 });
      const b = fase(p, 0.4, 0.75);
      tarjeta(ctx, 110, 750, 1700, 200, { acento: C.cian, alpha: b });
      const xs = [160, 590, 890, 1170];
      [['TN acopiadas', n3(t.tn_acopio * b)], ['Viajes', n0(t.viajes * b)], ['Unidades', n0(t.unidades_activas * b)], ['Período', `${fecha(A.ini)} – ${fecha(A.fin)}`]].forEach(([l, v], k) => {
        txt(ctx, l.toUpperCase(), xs[k], 815, { size: 22, peso: 800, color: C.mut, alpha: b });
        txt(ctx, v, xs[k], 895, { size: k === 3 ? 44 : 56, peso: 800, alpha: b, max: k === 3 ? 600 : 380 });
      });
    } else {
      const a2 = fase(p, 0.15, 0.5);
      txt(ctx, 'Gracias', W / 2, 520, { size: 150, peso: 900, align: 'center', alpha: a2 });
      txt(ctx, `${op.nave} · Orden ${op.orden} — operación finalizada con éxito`, W / 2, 610, { size: 40, peso: 600, color: '#bae6fd', align: 'center', alpha: fase(p, 0.3, 0.6), max: W - 200 });
      txt(ctx, `${n3(t.tn_acopio)} TN acopiadas en ${n0(t.viajes)} viajes`, W / 2, 690, { size: 34, peso: 600, color: C.mut, align: 'center', alpha: fase(p, 0.4, 0.7) });
      if (op.coordinador) txt(ctx, `Coordinador de transporte: ${op.coordinador}`, W / 2, 760, { size: 28, peso: 500, color: C.mut, align: 'center', alpha: fase(p, 0.5, 0.8) });
    }
    return;
  }
  encabezado(ctx, s, i, total, op, logo, p);
  const X = 110, Y = 320, AW = W - 220;
  if (s.id === 'fotos') {
    // Cada foto entra con un leve acercamiento y se ajusta completa (sin recortes) en su marco
    const n = s.fotos.length, gap = 60, alto = H - Y - 150, ancho = (AW - gap * (n - 1)) / n;
    s.fotos.forEach((f, k) => {
      const im = f.im; if (!im) return;
      const a = fase(p, 0.1 + k * 0.12, 0.55 + k * 0.12), hDesc = f.desc ? 70 : 0;
      const esc = Math.min(ancho / im.width, (alto - hDesc) / im.height), w = im.width * esc, h = im.height * esc;
      const bx = X + k * (ancho + gap), x = bx + (ancho - w) / 2, y = Y + (alto - hDesc - h) / 2 + (1 - a) * 40;
      ctx.save(); ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; rr(ctx, x - 10, y - 10, w + 20, h + 20, 26); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
      ctx.shadowColor = 'transparent'; rr(ctx, x, y, w, h, 18); ctx.clip();
      const z = 1.06 - 0.06 * p; // acercamiento suave (efecto Ken Burns)
      ctx.drawImage(im, x - (w * (z - 1)) / 2, y - (h * (z - 1)) / 2, w * z, h * z);
      ctx.restore();
      if (f.desc) txt(ctx, f.desc, bx + ancho / 2, y + h + 62, { size: 34, peso: 700, align: 'center', max: ancho, alpha: fase(p, 0.35 + k * 0.12, 0.7 + k * 0.12) });
    });
  } else if (s.id === 'cifras') {
    const it = [['TN programadas', t.tn_programadas, n3, 'meta de la operación', C.azul], ['TN despachadas', t.tn_despacho, n3, 'planta Huacho', C.cian],
      ['TN acopiadas', t.tn_acopio, n3, `${n1((A.cumpl || 0) * 100)} % de la meta`, C.verde], ['TN embarcadas', t.tn_embarque || 0, n3, 'a la nave', C.violeta],
      ['Viajes', t.viajes, n0, `${n0(t.unidades_activas)} unidades`, C.naranja], ['Días de operación', A.dias || 0, n0, `${fecha(A.ini)} – ${fecha(A.fin)}`, C.rosa]];
    const w = (AW - 2 * 40) / 3;
    it.forEach(([l, v, f, sub, col], k) => kpi(ctx, X + (k % 3) * (w + 40), Y + Math.floor(k / 3) * 310, w, 260, l, v, f, sub, col, p, 0.05 + k * 0.06));
  } else if (s.id === 'cumplimiento') {
    const c = A.cumpl || 0, a = fase(p, 0.1, 0.7);
    const cx = X + 340, cy = Y + 340, r = 270;
    ctx.save(); ctx.lineWidth = 46; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, C.verde); g.addColorStop(1, C.cian); ctx.strokeStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c) * a); ctx.stroke(); ctx.restore();
    txt(ctx, `${n1(c * 100 * a)} %`, cx, cy + 30, { size: 110, peso: 900, align: 'center' });
    txt(ctx, 'de la meta acopiada', cx, cy + 90, { size: 28, peso: 600, color: C.mut, align: 'center' });
    const bx = X + 820, bw = AW - 820;
    [['Despacho en planta', t.tn_despacho, C.azul], ['Acopio en puerto', t.tn_acopio, C.verde], ['Embarque a la nave', t.tn_embarque || 0, C.violeta]].forEach(([l, v, col], k) => {
      const y = Y + 40 + k * 200; const fr = t.tn_programadas ? v / t.tn_programadas : 0;
      txt(ctx, l, bx, y, { size: 32, peso: 700, alpha: fase(p, 0.1 + k * 0.1, 0.4 + k * 0.1) });
      txt(ctx, `${n3(v)} TN · ${n1(fr * 100)} %`, bx + bw, y, { size: 30, peso: 700, color: col, align: 'right', alpha: fase(p, 0.1 + k * 0.1, 0.4 + k * 0.1) });
      barra(ctx, bx, y + 30, bw, 34, fr, col, p, 0.15 + k * 0.1);
    });
  } else if (s.id === 'avance') {
    tarjeta(ctx, X, Y, 1180, 660); revelar(ctx, G.avance, X + 40, Y + 20, 1100, 620, p);
    const x2 = X + 1220, w2 = AW - 1220;
    [['Ritmo acopio', `${n0(A.tphA)} TN/h`, C.naranja], ['Ritmo despacho', `${n0(A.tphD)} TN/h`, C.azul], ['Reportes de avance', `${A.ra.length || A.rdp.length}`, C.cian]].forEach(([l, v, col], k) => {
      const a = fase(p, 0.3 + k * 0.1, 0.6 + k * 0.1); tarjeta(ctx, x2, Y + k * 225, w2, 205, { acento: col, alpha: a });
      txt(ctx, l.toUpperCase(), x2 + 32, Y + k * 225 + 70, { size: 22, peso: 800, color: C.mut, alpha: a }); txt(ctx, v, x2 + 32, Y + k * 225 + 155, { size: 56, peso: 800, alpha: a, max: w2 - 60 });
    });
  } else if (s.id === 'jornadas') {
    tarjeta(ctx, X, Y, 1180, 660); revelar(ctx, G.jornadas, X + 40, Y + 20, 1100, 620, p);
    const x2 = X + 1220, w2 = AW - 1220, m = A.mejorA;
    const a = fase(p, 0.35, 0.7); tarjeta(ctx, x2, Y, w2, 660, { acento: C.ambar, alpha: a });
    txt(ctx, 'JORNADA MÁS PRODUCTIVA', x2 + 32, Y + 70, { size: 22, peso: 800, color: C.ambar, alpha: a });
    if (m) {
      txt(ctx, n3(m.tn), x2 + 32, Y + 170, { size: 66, peso: 900, alpha: a, max: w2 - 60 }); txt(ctx, 'TN', x2 + 32, Y + 215, { size: 26, peso: 700, color: C.mut, alpha: a });
      txt(ctx, fecha(m.fecha), x2 + 32, Y + 300, { size: 40, peso: 800, alpha: a }); txt(ctx, m.jornada, x2 + 32, Y + 350, { size: 32, peso: 600, color: '#bae6fd', alpha: a });
      txt(ctx, `${m.viajes} viajes`, x2 + 32, Y + 400, { size: 30, peso: 600, color: C.mut, alpha: a });
      const prom = A.ja.reduce((s2, x) => s2 + x.tn, 0) / A.ja.length;
      parrafo(ctx, `Promedio por jornada: ${n3(prom)} TN en ${A.ja.length} jornadas de acopio.`, x2 + 32, Y + 490, w2 - 64, { size: 26, color: C.mut, alpha: a });
    }
  } else if (s.id === 'transportistas') {
    const filas = A.tr.slice(0, 8); const max = filas[0]?.tn_final || 1;
    filas.forEach((x, k) => {
      const y = Y + 20 + k * 82, a = fase(p, 0.05 + k * 0.06, 0.35 + k * 0.06);
      txt(ctx, `${k + 1}`, X, y + 38, { size: 34, peso: 900, color: SERIE[k % 8], alpha: a });
      txt(ctx, x.nombre_comercial, X + 60, y + 38, { size: 32, peso: 700, alpha: a, max: 420 });
      barra(ctx, X + 500, y + 10, 640, 36, x.tn_final / max, SERIE[k % 8], p, 0.1 + k * 0.06);
      txt(ctx, `${n3(x.tn_final)} TN`, X + 1400, y + 38, { size: 28, peso: 800, alpha: a, align: 'right' });
      txt(ctx, `${n1((x.tn_final / A.totTr) * 100)} % · ${n0(x.viajes_realizados)} viajes`, AW + X, y + 38, { size: 24, peso: 600, color: C.mut, align: 'right', alpha: a });
    });
  } else if (s.id === 'flota') {
    tarjeta(ctx, X, Y, 1100, 620); revelar(ctx, G.vueltas, X + 50, Y + 30, 1000, 560, p);
    const x2 = X + 1140, w2 = AW - 1140;
    [['Unidades activas', A.u.unidades_activas, n0, C.cian], ['Viajes por unidad', A.viajesUnidad || 0, n1, C.verde], ['Máx. vueltas', A.unidMax?.viajes || 0, n0, C.violeta]].forEach(([l, v, f, col], k) =>
      kpi(ctx, x2, Y + k * 215, w2, 195, l, v, f, k === 2 && A.unidMax ? `unidad ${A.unidMax.placa}` : '', col, p, 0.3 + k * 0.1));
  } else if (s.id === 'puerto') {
    tarjeta(ctx, X, Y, 680, 660); revelar(ctx, G.rangos, X + 30, Y + 20, 620, 620, p);
    const x2 = X + 720, w2 = AW - 720;
    kpi(ctx, x2, Y, (w2 - 40) / 2, 260, 'Atención ≤ 30 min', (A.p30 || 0) * 100, (v) => `${n1(v)} %`, `${n0(A.tt[A.R[0]])} de ${n0(A.tt.total)} viajes`, C.verde, p, 0.25);
    kpi(ctx, x2 + (w2 + 40) / 2, Y, (w2 - 40) / 2, 260, 'Tiempo promedio', hm(t.tiempo_prom_min), null, 'horas en puerto', C.cian, p, 0.3);
    const a = fase(p, 0.45, 0.8); tarjeta(ctx, x2, Y + 300, w2, 360, { acento: C.ambar, alpha: a });
    A.R.forEach((r, k) => { txt(ctx, r, x2 + 40, Y + 390 + k * 90, { size: 30, peso: 700, color: [C.verde, C.ambar, C.rojo][k], alpha: a });
      txt(ctx, `${n0(A.tt[r])} viajes · ${n1(((A.tt[r] || 0) / (A.tt.total || 1)) * 100)} %`, x2 + w2 - 40, Y + 390 + k * 90, { size: 30, peso: 700, align: 'right', alpha: a }); });
  } else if (s.id === 'balance') {
    const it = [['Despachado en planta', t.tn_despacho, C.azul], ['Acopiado en puerto', t.tn_acopio, C.verde], ['Embarcado', t.tn_embarque, C.violeta], ['Draft SGS', t.tn_draft_sgs, C.naranja]];
    const max = Math.max(1, ...it.map((x) => x[1] || 0));
    it.forEach(([l, v, col], k) => { const y = Y + 10 + k * 100, a = fase(p, 0.05 + k * 0.08, 0.35 + k * 0.08);
      txt(ctx, l, X, y + 40, { size: 32, peso: 700, alpha: a }); barra(ctx, X + 420, y + 12, 900, 40, (v || 0) / max, col, p, 0.1 + k * 0.08);
      txt(ctx, v == null ? '—' : `${n3(v)} TN`, AW + X, y + 44, { size: 32, peso: 800, align: 'right', alpha: a }); });
    const d = [['Dif. puerto − planta', t.diferencia_acopio_despacho], ['Dif. embarque − acopio', t.dif_embarque_acopio], ['Dif. draft − embarque', t.dif_draft_embarque], ['Rechazado / devuelto', t.tn_devueltas]];
    const w = (AW - 3 * 30) / 4;
    d.forEach(([l, v], k) => kpi(ctx, X + k * (w + 30), Y + 430, w, 215, l, v == null ? '—' : v, n3, 'TN', [C.cian, C.violeta, C.naranja, C.rojo][k], p, 0.4 + k * 0.06));
  } else if (s.id === 'hallazgos') {
    const wc = (AW - 50) / 2;
    tarjeta(ctx, X, Y, wc, 660, { acento: C.cian }); tarjeta(ctx, X + wc + 50, Y, wc, 660, { acento: C.verde });
    txt(ctx, 'HALLAZGOS', X + 40, Y + 70, { size: 26, peso: 800, color: C.cian }); txt(ctx, 'RECOMENDACIONES', X + wc + 90, Y + 70, { size: 26, peso: 800, color: C.verde });
    let y = Y + 130;
    A.hallazgos.slice(0, 7).forEach((h, k) => { const a = fase(p, 0.08 + k * 0.07, 0.3 + k * 0.07); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.cian; ctx.beginPath(); ctx.arc(X + 50, y - 9, 7, 0, 7); ctx.fill(); ctx.restore();
      y = parrafo(ctx, h, X + 75, y, wc - 110, { size: 24, lh: 1.35, alpha: a }) + 12; });
    let y2 = Y + 130;
    A.recomendaciones.forEach((h, k) => { const a = fase(p, 0.4 + k * 0.08, 0.6 + k * 0.08); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.verde; ctx.beginPath(); ctx.arc(X + wc + 100, y2 - 9, 7, 0, 7); ctx.fill(); ctx.restore();
      y2 = parrafo(ctx, h, X + wc + 125, y2, wc - 110, { size: 25, lh: 1.4, alpha: a }) + 18; });
  }
}

const cargarImg = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
async function preparar(d, fotos = []) {
  try { await document.fonts?.load(`800 40px Inter`); await document.fonts?.ready; } catch { /* */ }
  const A = analizar(d);
  A.fotos = (await Promise.all(fotos.map(async (f) => ({ ...f, im: await cargarImg(f.src) })))).filter((f) => f.im);
  const S = diapositivas(A);
  const G = graficos(A);
  const lg = await logoBase64();
  const logo = lg ? await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = lg; }) : null;
  return { A, S, G, logo };
}

/** Imágenes JPEG de cada diapositiva (estáticas, p = 1). */
async function imagenes(P) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  return P.S.map((s, i) => { pintar(ctx, s, i, P.S.length, P.A, P.G, P.logo, 1); return c.toDataURL('image/jpeg', 0.92); });
}

/* ===================== PDF ===================== */
export async function pdfInforme(d, fotos = []) {
  const P = await preparar(d, fotos); const ims = await imagenes(P);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [338.67, 190.5] });
  ims.forEach((im, i) => { if (i) doc.addPage([338.67, 190.5], 'landscape'); doc.addImage(im, 'JPEG', 0, 0, 338.67, 190.5); });
  doc.setProperties({ title: `Informe de operación · ${P.A.op.nave} · Orden ${P.A.op.orden}`, author: (P.A.op.empresa || '').trim() });
  return doc.output('blob');
}

/* ===================== PowerPoint (también para Canva) ===================== */
const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) cargados.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`No se pudo cargar ${src}`)); document.head.appendChild(s); }));
  return cargados.get(src);
}
export async function pptxInforme(d, fotos = []) {
  const P = await preparar(d, fotos); const ims = await imagenes(P);
  await cargarScript('vendor/pptxgen.bundle.js');
  const X = new window.PptxGenJS(); X.layout = 'LAYOUT_WIDE';
  X.author = (P.A.op.empresa || '').trim(); X.company = X.author; X.title = `Informe de operación · ${P.A.op.nave} · Orden ${P.A.op.orden}`;
  ims.forEach((im, i) => { const sl = X.addSlide(); sl.background = { color: '050B18' }; sl.addImage({ data: im, x: 0, y: 0, w: 13.333, h: 7.5 }); if (P.S[i].notas) sl.addNotes(P.S[i].notas); });
  return X.write({ outputType: 'blob' });
}

/* ===================== Video animado con música ===================== */
export function formatoVideoAudio() {
  const tipos = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const t = tipos.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
  return t ? { mime: t, ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}
function pista(ctx, destino, dur) {
  const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(destino);
  const rev = ctx.createConvolver(); const L = ctx.sampleRate * 2.5; const ir = ctx.createBuffer(2, L, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const dd = ir.getChannelData(c); for (let i = 0; i < L; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 2.5); }
  rev.buffer = ir; const rg = ctx.createGain(); rg.gain.value = 0.4; rev.connect(rg).connect(master);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(rev);
  const f = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const nota = (tipo, fr, t, d, v, at = 0.02, corte = 2600, det = 0) => { const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = fr; o.detune.value = det;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = corte; const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + d + 0.05); };
  const bombo = (t, v) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g).connect(master); o.start(t); o.stop(t + 0.45); };
  const AC = [[48, 60, 64, 67, 71], [43, 59, 62, 67, 74], [45, 57, 60, 64, 72], [41, 57, 60, 65, 69]];
  const t0 = ctx.currentTime + 0.1, BAR = 2;
  for (let b = 0; b * BAR < dur; b++) {
    const ac = AC[b % 4], t = t0 + b * BAR;
    ac.slice(1).forEach((n) => [-6, 0, 6].forEach((dt) => nota('sawtooth', f(n), t, BAR + 0.5, 0.016, 0.5, 1500, dt)));
    nota('sine', f(ac[0] - 12), t, BAR, 0.2, 0.05, 400);
    if (b >= 1 && b * BAR < dur - 3) { for (let k = 0; k < 8; k++) nota('triangle', f(ac[1 + (k % 4)] + 12), t + k * 0.25, 0.28, 0.045, 0.01, 3200); bombo(t, 0.45); bombo(t + 1, 0.45); }
  }
  master.gain.exponentialRampToValueAtTime(0.75, t0 + 1.5);
  master.gain.setValueAtTime(0.75, t0 + dur - 2.5); master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}
export async function videoInforme(d, { segundos = 6, conMusica = true, alProgreso, fotos = [] } = {}) {
  const fmt = formatoVideoAudio();
  if (!fmt) throw new Error('Este navegador no permite grabar video. Use Chrome o Edge actualizados.');
  const P = await preparar(d, fotos);
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d'); ctx.scale(1280 / W, 720 / H);
  const n = P.S.length, dur = segundos * 1000, trans = 800, total = n * dur;
  const vstream = c.captureStream(30);
  let actx = null; const pistas = [...vstream.getVideoTracks()];
  if (conMusica && (window.AudioContext || window.webkitAudioContext)) {
    actx = new (window.AudioContext || window.webkitAudioContext)(); try { await actx.resume(); } catch { /* */ }
    const dest = actx.createMediaStreamDestination(); pista(actx, dest, total / 1000); pistas.push(...dest.stream.getAudioTracks());
  }
  const stream = new MediaStream(pistas);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 6_000_000 });
  const partes = []; rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  const fin = new Promise((r) => { rec.onstop = r; });
  const dibujar = (msT) => {
    const k = Math.min(n - 1, Math.floor(msT / dur)), dentro = msT - k * dur, p = Math.min(1, dentro / (dur * 0.75));
    if (k > 0 && dentro < trans) {
      // Transición: la anterior se desplaza y desvanece; la nueva entra desde la derecha
      const e = ease(dentro / trans);
      ctx.save(); ctx.translate(-W * 0.25 * e, 0); ctx.globalAlpha = 1 - e; pintar(ctx, P.S[k - 1], k - 1, n, P.A, P.G, P.logo, 1); ctx.restore();
      ctx.save(); ctx.translate(W * 0.25 * (1 - e), 0); ctx.globalAlpha = e; pintar(ctx, P.S[k], k, n, P.A, P.G, P.logo, p); ctx.restore();
    } else pintar(ctx, P.S[k], k, n, P.A, P.G, P.logo, p);
  };
  dibujar(0); rec.start(1000);
  const t0 = performance.now();
  await new Promise((res) => { const paso = () => { const m = performance.now() - t0; dibujar(Math.min(m, total - 1)); alProgreso?.(Math.min(1, m / total)); if (m >= total) return res(); setTimeout(paso, 1000 / 30); }; paso(); });
  rec.stop(); await fin;
  stream.getTracks().forEach((tr) => tr.stop()); try { actx?.close(); } catch { /* */ }
  return { blob: new Blob(partes, { type: fmt.mime.split(';')[0] }), ext: fmt.ext };
}

/** Vista previa (imágenes) para mostrar en pantalla. */
export async function vistaPrevia(d, fotos = []) { const P = await preparar(d, fotos); return imagenes(P); }
