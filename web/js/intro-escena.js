// Escena de la presentación dibujada en canvas a la resolución real de la pantalla.
// Muestra la operación completa: el tracto con semirremolque tolva sale de Salinas Huacho, llega a la
// loza de acopio del Puerto CSPCP (en tierra, antes del muelle), gira, retrocede, levanta la tolva y
// descarga la sal. Luego regresa hacia Salinas y sale de la pantalla. Mientras tanto, la faja y el
// cargador de buques llevan la sal de la ruma a la bodega de la nave atracada.
// Coordenadas del "mundo": 1600 × 900. La pista está en y = 700–752 y el muelle termina en x = 1190.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const suave = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
const salida = (p) => 1 - Math.pow(1 - clamp(p), 3);
// Arranque: acelera y luego sigue a velocidad constante (sin frenar al final)
const arranque = (p) => { p = clamp(p); return (p < 0.4 ? (p * p) / 0.8 : p - 0.2) / 0.8; };

const L = 245;          // largo del camión (tracto + semirremolque)
const GT = 730;         // apoyo de las ruedas sobre la pista
const MUELLE = 1190;    // borde del muelle: a la derecha está el mar
const AGUA = 760;       // nivel del agua
const LOZA = [840, 1170];
const PARADA = 1040;    // hasta aquí llega el frente del camión (siempre en tierra, sobre la loza)
const DESCARGA = 1058;  // posición de la compuerta trasera al descargar
const RUMA = { cx: 1110, base: 728 };

/* Momentos de la escena (segundos desde que empieza la presentación) */
const T = { sale: 3.5, llega: 8.3, giro: 9.1, retro: 9.6, sube: 9.8, vacia: 10.3, baja: 12.0, abajo: 12.9, vuelve: 13.2, fuera: 17.6 };

function estadoCamion(t, x0, xFin) {
  const fr0 = DESCARGA - L; // frente al terminar la descarga (mirando hacia Salinas)
  const d1 = PARADA - x0;
  let cx, dir = 1, tilt = 0, d = 0;
  if (t < T.sale) { cx = x0 - L / 2; }
  else if (t < T.llega) { const e = 1 - arranque(1 - (t - T.sale) / (T.llega - T.sale)); cx = x0 + d1 * e - L / 2; d = d1 * e; }
  else if (t < T.giro) { const p = (t - T.llega) / (T.giro - T.llega); cx = PARADA - L / 2; dir = Math.cos(Math.PI * suave(p)); d = d1 + 30 * p; }
  else if (t < T.retro) { const e = suave((t - T.giro) / (T.retro - T.giro)); dir = -1; cx = PARADA + (DESCARGA - PARADA) * e - L / 2; d = d1 + 30 - (DESCARGA - PARADA) * e; }
  else if (t < T.vuelve) {
    dir = -1; cx = DESCARGA - L / 2; d = d1 + 30 - (DESCARGA - PARADA);
    if (t > T.sube) tilt = t < T.sube + 0.8 ? suave((t - T.sube) / 0.8) : t < T.baja ? 1 : 1 - suave((t - T.baja) / (T.abajo - T.baja));
  } else {
    const e = arranque((t - T.vuelve) / (T.fuera - T.vuelve));
    const fr = fr0 + (xFin - fr0) * e;
    dir = -1; cx = fr + L / 2; d = d1 + 30 - (DESCARGA - PARADA) + (fr0 - fr);
  }
  return { cx, dir, tilt: tilt * 38 * Math.PI / 180, rot: d / 13 };
}

function alturaRuma(t) { return 52 + 30 * suave((t - 10.4) / 2); }

export function escena(canvas, t0, reducido) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, s = 1, oy = 0, VW = 1600, camX = null, camMin = 0, camMax = 0;
  let gCielo, vivo = true, tPrev = 0;

  // Degradados creados una sola vez (en coordenadas del mundo o locales)
  const lin = (x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const rad = (r, stops) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const G = {
    sol: rad(230, [[0, '#fff7d6'], [0.18, '#fde68a'], [0.4, 'rgba(251,191,36,.55)'], [1, 'rgba(249,115,22,0)']]),
    luz: rad(60, [[0, 'rgba(254,240,138,.9)'], [0.3, 'rgba(254,240,138,.35)'], [1, 'rgba(254,240,138,0)']]),
    marFondo: lin(0, 698, 0, 900, [[0, '#1f4e79'], [0.15, '#0e4a6b'], [1, '#062238']]),
    mar: lin(0, AGUA, 0, 900, [[0, 'rgba(14,116,144,.93)'], [1, 'rgba(4,28,48,.98)']]),
    pista: lin(0, 700, 0, 752, [[0, '#334155'], [0.08, '#1e293b'], [1, '#111827']]),
    loza: lin(0, 700, 0, 752, [[0, '#94a3b8'], [0.1, '#64748b'], [1, '#3f4a5c']]),
    suelo: lin(0, 752, 0, 900, [[0, '#0f172a'], [1, '#050a16']]),
    muro: lin(0, 752, 0, 900, [[0, '#475569'], [1, '#1e293b']]),
    sal: lin(0, -1, 0, 0, [[0, '#ffffff'], [1, '#cbd5e1']]),
    salRuma: lin(0, 600, 0, 730, [[0, '#ffffff'], [0.6, '#e2e8f0'], [1, '#a5b4c8']]),
    casco: lin(0, 612, 0, 760, [[0, '#24466f'], [1, '#0f2340']]),
    tolva: lin(0, -66, 0, 0, [[0, '#f8fafc'], [0.55, '#cbd5e1'], [1, '#8b9bb0']]),
    cabina: lin(0, -110, 0, -30, [[0, '#60a5fa'], [0.5, '#2563eb'], [1, '#1e3a8a']]),
    deflector: lin(0, -112, 0, -98, [[0, '#93c5fd'], [1, '#3b82f6']]),
    cromo: lin(0, -32, 0, -22, [[0, '#f1f5f9'], [1, '#64748b']]),
    faro: lin(0, 0, 170, 0, [[0, 'rgba(254,240,138,.55)'], [1, 'rgba(254,240,138,0)']]),
  };

  // Siluetas fijas (Path2D, se construyen una vez)
  const cerro = (desde, hasta, f) => { const p = new Path2D(); p.moveTo(desde, 702); for (let x = desde; x <= hasta; x += 20) p.lineTo(x, f(x)); p.lineTo(hasta, 702); p.closePath(); return p; };
  const caida = (x) => clamp((1160 - x) / 160);
  const CERRO_LEJOS = cerro(-1400, 1160, (x) => 700 - caida(x) * (70 + 34 * Math.sin(x * 0.0042) + 22 * Math.sin(x * 0.011 + 1.3)));
  const CERRO_CERCA = cerro(-1400, 1100, (x) => 700 - clamp((1100 - x) / 120) * (26 + 16 * Math.sin(x * 0.0075 + 2) + 8 * Math.sin(x * 0.023)));
  const CASCO = new Path2D('M1204 560 L2900 560 L2900 760 L1236 760 Q1212 736 1206 660 Z');
  const FRANJA = new Path2D('M1226 742 L2900 742 L2900 760 L1236 760 Q1230 752 1226 742 Z');
  // Recorrido de la sal: faja desde la ruma de acopio hasta la torre del cargador de buques, brazo sobre la nave y chute a bodega
  const FAJA = [[860, 700], [1168, 520], [1414, 500], [1414, 556]];
  const tramos = FAJA.slice(1).map((p, i) => Math.hypot(p[0] - FAJA[i][0], p[1] - FAJA[i][1]));
  const largoFaja = tramos.reduce((a, b) => a + b, 0);
  const enFaja = (u) => { let d = u * largoFaja; for (let i = 0; i < tramos.length; i++) { if (d <= tramos[i]) { const k = d / tramos[i]; return [FAJA[i][0] + (FAJA[i + 1][0] - FAJA[i][0]) * k, FAJA[i][1] + (FAJA[i + 1][1] - FAJA[i][1]) * k, i]; } d -= tramos[i]; } return [...FAJA[3], 2]; };

  const ajustar = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    s = Math.max(W / 1600, H / 1500);           // en teléfonos verticales la escena se agranda y la cámara sigue al camión
    oy = H - 900 * s; VW = W / s;
    if (VW >= 1760) { camMin = camMax = 860 - VW / 2; } else { camMin = -60; camMax = 1700 - VW; }
    const hz = oy + 700 * s;
    gCielo = ctx.createLinearGradient(0, 0, 0, hz);
    [[0, 'rgba(11,27,63,0)'], [0.45, 'rgba(76,29,149,.22)'], [0.78, 'rgba(234,88,12,.38)'], [1, 'rgba(251,191,36,.62)']].forEach(([o, c]) => gCielo.addColorStop(o, c));
    camX = null;
  };
  ajustar();

  const estrella = (x, y, r, a) => { ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25); ctx.closePath(); ctx.fill(); };

  function rueda(x, y, r, rot) {
    ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    for (let k = 0; k < 5; k++) { const a = rot + (k * Math.PI * 2) / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, 1.2, 0, Math.PI * 2); ctx.fill(); }
  }
  const guardabarro = (x, r) => { ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, -13, r + 4, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); };

  /* Tracto con semirremolque tolva, mirando a la derecha. Origen: parte trasera a nivel del suelo. */
  function camion(rot, tilt, carga) {
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(L / 2, 1, L / 2 + 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    // chasis del semirremolque
    ctx.fillStyle = '#1f2937'; ctx.fillRect(2, -31, 184, 7);
    ctx.fillStyle = '#334155'; ctx.fillRect(146, -24, 4, 14); ctx.fillRect(140, -11, 16, 3); // patas de apoyo
    // luces traseras y parachoques
    ctx.fillStyle = '#ef4444'; ctx.fillRect(0, -30, 3, 5);
    ctx.fillStyle = '#111827'; ctx.fillRect(2, -16, 8, 3);
    // cilindro hidráulico (sólo cuando se levanta la tolva)
    const hx = 4, hy = -31;
    if (tilt > 0.005) {
      const px = 170, py = -6;
      const ex = hx + px * Math.cos(tilt) + py * Math.sin(tilt), ey = hy - px * Math.sin(tilt) + py * Math.cos(tilt);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(176, -30); ctx.lineTo(176 + (ex - 176) * 0.55, -30 + (ey + 30) * 0.55); ctx.stroke();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(176, -30); ctx.lineTo(ex, ey); ctx.stroke();
    }
    // tolva basculante (gira sobre la bisagra trasera)
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-tilt);
    ctx.fillStyle = G.tolva;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, -62); ctx.quadraticCurveTo(-3, -66, 2, -66); ctx.lineTo(172, -68); ctx.quadraticCurveTo(178, -68, 178, -62); ctx.lineTo(176, -4); ctx.quadraticCurveTo(176, 0, 172, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(71,85,105,.55)'; ctx.lineWidth = 1.6;
    for (let x = 20; x < 170; x += 22) { ctx.beginPath(); ctx.moveTo(x, -64); ctx.lineTo(x, -2); ctx.stroke(); }
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-3, -68, 181, 4); // baranda superior
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(2, -24, 172, 7);  // franja azul
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(2, -17, 172, 2);
    ctx.fillStyle = '#fbbf24'; for (let x = 6; x < 170; x += 26) ctx.fillRect(x, -9, 12, 3); // cinta reflectiva
    // carga de sal (colmo sobre la tolva)
    if (carga > 0.01) {
      ctx.save(); ctx.translate(0, -66); ctx.fillStyle = G.sal;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.bezierCurveTo(40, -26 * carga, 130, -30 * carga, 172, -1); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // compuerta trasera: se abre al levantar la tolva
    const ab = clamp((tilt * 180 / Math.PI - 8) / 18) * 0.9;
    ctx.save(); ctx.translate(-3, -64); ctx.rotate(ab);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(-4, 0, 5, 62); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-4, 0, 2, 62);
    ctx.restore();
    ctx.restore();
    // ruedas del semirremolque (3 ejes)
    [26, 54, 82].forEach((x) => { guardabarro(x, 13); rueda(x, -13, 13, rot); });
    // tracto: chasis, quinta rueda, tanque y escape
    ctx.fillStyle = '#111827'; ctx.fillRect(158, -30, 86, 8);
    ctx.fillStyle = '#374151'; ctx.fillRect(166, -36, 24, 5);
    ctx.fillStyle = G.cromo; ctx.beginPath(); ctx.roundRect(198, -33, 28, 11, 4); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(189, -112, 5, 82); ctx.fillStyle = '#475569'; ctx.fillRect(188, -114, 7, 4);
    // cabina
    ctx.fillStyle = G.cabina;
    ctx.beginPath(); ctx.moveTo(196, -30); ctx.lineTo(196, -96); ctx.quadraticCurveTo(196, -101, 201, -101); ctx.lineTo(237, -101); ctx.quadraticCurveTo(243, -101, 244, -95); ctx.lineTo(247, -62); ctx.lineTo(248, -30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = G.deflector; ctx.beginPath(); ctx.moveTo(200, -101); ctx.quadraticCurveTo(214, -118, 238, -110); ctx.lineTo(238, -101); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bae6fd'; ctx.beginPath(); ctx.moveTo(214, -92); ctx.lineTo(239, -92); ctx.lineTo(242, -68); ctx.lineTo(214, -68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(218, -90); ctx.lineTo(226, -90); ctx.lineTo(219, -72); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(211, -95); ctx.lineTo(211, -34); ctx.stroke(); // puerta
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(214, -62, 9, 2.5);
    ctx.fillStyle = '#fbbf24'; ctx.fillRect(198, -58, 48, 3);   // franja de la cabina
    ctx.fillStyle = '#0f172a'; ctx.fillRect(245, -90, 4, 16); ctx.fillRect(244, -76, 2, 6); // espejo
    ctx.fillStyle = '#1f2937'; ctx.fillRect(239, -50, 10, 20);  // parrilla y parachoques
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(240, -34, 10, 5);
    ctx.fillStyle = '#fef08a'; ctx.fillRect(244, -46, 5, 5);    // faro
    ctx.fillStyle = '#f97316'; ctx.fillRect(244, -40, 5, 3);
    ctx.save(); ctx.translate(249, -43); ctx.fillStyle = G.faro; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(170, -22); ctx.lineTo(170, 18); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#334155'; ctx.fillRect(203, -30, 3, 6); ctx.fillRect(200, -26, 12, 2); // estribo
    // ruedas del tracto (eje motriz doble y eje delantero)
    [172, 200, 230].forEach((x) => { guardabarro(x, 13); rueda(x, -13, 13, rot); });
  }

  function ruma(cx, base, h, hw) {
    ctx.fillStyle = G.salRuma; ctx.beginPath(); ctx.moveTo(cx - hw, base); ctx.quadraticCurveTo(cx, base - 2 * h, cx + hw, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(100,116,139,.22)'; ctx.beginPath(); ctx.moveTo(cx, base - h); ctx.quadraticCurveTo(cx + hw * 0.5, base - h * 0.95, cx + hw, base); ctx.lineTo(cx + hw * 0.15, base); ctx.closePath(); ctx.fill();
  }

  function dibujar(t, dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alfa = reducido ? 1 : clamp((t - 3) / 1.4);
    if (alfa <= 0) return;
    const amanecer = reducido ? 1 : salida((t - 3.2) / 7);
    const x0 = camMin - 12, xFin = camMin - 270;
    const c = estadoCamion(t, x0, xFin), c2 = estadoCamion(t - 0.04, x0, xFin);
    const vel = Math.abs(c.cx - c2.cx) / 0.04;
    // cámara: sigue al camión en pantallas angostas; fija en pantallas anchas
    // el camión va a un lado de la pantalla y se ve hacia dónde avanza (al ir: el puerto y la nave; al volver: Salinas)
    const objetivo = clamp(c.cx - VW * (t < T.vuelve ? 0.3 : 0.64), camMin, camMax);
    camX = camX == null ? objetivo : camX + (objetivo - camX) * (1 - Math.exp(-dt * 2.4));
    const izq = camX - 30, der = camX + VW + 30;

    // cielo del amanecer
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alfa * (0.35 + 0.65 * amanecer); ctx.fillStyle = gCielo; ctx.fillRect(0, 0, W, oy + 701 * s);
    ctx.globalAlpha = alfa;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, -camX * dpr * s, oy * dpr);

    // sol detrás de los cerros
    ctx.save(); ctx.translate(780, 780 - 215 * amanecer); ctx.globalAlpha = alfa * (0.4 + 0.6 * amanecer); ctx.fillStyle = G.sol; ctx.fillRect(-230, -230, 460, 460); ctx.restore();
    ctx.globalAlpha = alfa;
    // mar de fondo hasta el horizonte
    ctx.fillStyle = G.marFondo; ctx.fillRect(1080, 698, Math.max(0, der - 1080), 210);
    ctx.fillStyle = 'rgba(253,186,116,.35)'; for (let k = 0; k < 6; k++) ctx.fillRect(1240 + ((k * 173 + t * 12) % 600), 704 + k * 4, 40 + (k % 3) * 18, 1.5);
    // cerros
    ctx.fillStyle = '#1e1b4b'; ctx.fill(CERRO_LEJOS);
    ctx.fillStyle = '#0f1630'; ctx.fill(CERRO_CERCA);

    // Salinas Huacho: rumas de sal en la salina
    [[70, 160, 120], [215, 120, 105], [330, 86, 80], [-90, 110, 95]].forEach(([x, h, w]) => {
      ctx.fillStyle = G.salRuma; ctx.beginPath(); ctx.moveTo(x - w, 702); ctx.lineTo(x - 8, 702 - h); ctx.quadraticCurveTo(x, 702 - h - 6, x + 8, 702 - h); ctx.lineTo(x + w, 702); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(71,85,105,.28)'; ctx.beginPath(); ctx.moveTo(x + 4, 702 - h + 2); ctx.lineTo(x + w, 702); ctx.lineTo(x + w * 0.2, 702); ctx.closePath(); ctx.fill();
    });
    // postes de luz del puerto
    [[850, 548], [1160, 540]].forEach(([x, y]) => {
      ctx.fillStyle = '#64748b'; ctx.fillRect(x - 2, y, 4, 702 - y); ctx.fillStyle = '#cbd5e1'; ctx.fillRect(x - 12, y - 4, 24, 6);
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alfa * (1 - 0.7 * amanecer); ctx.fillStyle = G.luz; ctx.fillRect(-60, -60, 120, 120); ctx.restore(); ctx.globalAlpha = alfa;
    });
    // faja transportadora (de la ruma de acopio a la torre del cargador)
    ctx.lineCap = 'round';
    const celosia = (a, b) => {
      const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 18)); const nx = -(b[1] - a[1]), ny = b[0] - a[0], ln = Math.hypot(nx, ny); const ox = (nx / ln) * 7, oy2 = (ny / ln) * 7;
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(a[0] + ox, a[1] + oy2); ctx.lineTo(b[0] + ox, b[1] + oy2); ctx.stroke();
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(148,163,184,.75)'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const k0 = i / n, k1 = (i + 1) / n; ctx.moveTo(a[0] + (b[0] - a[0]) * k0, a[1] + (b[1] - a[1]) * k0); ctx.lineTo(a[0] + (b[0] - a[0]) * k1 + ox, a[1] + (b[1] - a[1]) * k1 + oy2); }
      ctx.stroke();
    };
    celosia(FAJA[0], FAJA[1]);
    ctx.fillStyle = '#64748b'; [[1010, 612], [1100, 560]].forEach(([x, y]) => ctx.fillRect(x - 2, y, 4, 702 - y));
    // torre del cargador de buques (sobre el muelle)
    ctx.fillStyle = '#475569'; ctx.fillRect(1166, 512, 12, 190); ctx.fillRect(1150, 694, 44, 8);
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(1158, 504, 28, 18);

    // pista, loza de acopio y suelo
    ctx.fillStyle = G.pista; ctx.fillRect(izq, 700, Math.max(0, MUELLE - izq), 52);
    ctx.fillStyle = G.loza; ctx.fillRect(LOZA[0], 700, LOZA[1] - LOZA[0] + 20, 52);
    ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = LOZA[0] + 40; x < MUELLE; x += 40) { ctx.moveTo(x, 701); ctx.lineTo(x - 8, 752); } ctx.stroke();
    ctx.fillStyle = '#facc15'; ctx.fillRect(LOZA[0], 748, LOZA[1] - LOZA[0], 3);
    ctx.fillStyle = 'rgba(226,232,240,.45)'; for (let x = Math.floor(izq / 44) * 44; x < LOZA[0] - 20; x += 44) ctx.fillRect(x, 725, 24, 3);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(izq, 700, Math.max(0, MUELLE - izq), 1.5);
    ctx.fillStyle = G.suelo; ctx.fillRect(izq, 752, Math.max(0, MUELLE - izq), 160);
    // pozas de la salina en primer plano
    for (let f = 0; f < 3; f++) for (let k = 0; k < 6; k++) {
      const x = -260 + k * 108 + f * 14, y = 778 + f * 34, w = 94 - f * 2;
      if (x > 470) continue;
      ctx.fillStyle = f === 0 ? 'rgba(241,245,249,.55)' : 'rgba(125,211,252,.26)'; ctx.fillRect(x, y, w, 24 + f * 3);
      ctx.strokeStyle = 'rgba(241,245,249,.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, 24 + f * 3);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 6, y + 5, w * 0.4, 2);
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) { const x = -200 + ((i * 97) % 620), y = i % 2 ? 790 + (i % 3) * 34 : 620 + (i % 4) * 18; estrella(x, y, 5, alfa * Math.max(0, Math.sin(t * 3 + i * 1.7))); }
    ctx.globalAlpha = alfa;
    // muro del muelle, defensas y bitas
    ctx.fillStyle = G.muro; ctx.fillRect(MUELLE - 6, 752, 6, 160);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(MUELLE - 2, 700, 2, 52);
    ctx.fillStyle = '#111827'; [1192].forEach((x) => { ctx.fillRect(x - 2, 756, 9, 30); });
    ctx.fillStyle = '#0b1220'; ctx.fillRect(MUELLE - 14, 693, 8, 7); ctx.fillRect(MUELLE - 16, 691, 12, 3);

    // ruma de acopio (fondo)
    ruma(975, 706, 92, 118);

    // nave graneladora atracada
    const bob = Math.sin(t * 0.9) * 1.3;
    ctx.save(); ctx.translate(0, bob);
    ctx.fillStyle = G.casco; ctx.fill(CASCO);
    ctx.fillStyle = '#b91c1c'; ctx.fill(FRANJA);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(1206, 559, 1700, 3);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '800 16px Inter, system-ui, sans-serif'; ctx.fillText('CHANCAY', 1240, 640);
    ctx.fillStyle = 'rgba(255,255,255,.65)'; for (let y = 690; y < 760; y += 10) ctx.fillRect(1700, y, 8, 2); // marcas de calado
    ctx.translate(0, -52); // la cubierta está 52 más arriba: nave de mayor francobordo
    // superestructura (popa)
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(1220, 520, 92, 92);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(1290, 520, 22, 92);
    ctx.fillStyle = '#1e3a5f'; for (let fila = 0; fila < 4; fila++) for (let k = 0; k < 6; k++) ctx.fillRect(1226 + k * 13, 530 + fila * 20, 7, 6);
    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(1212, 500, 108, 20);
    ctx.fillStyle = '#0f2340'; ctx.fillRect(1216, 505, 100, 8);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(1248, 470, 3, 30); ctx.fillRect(1238, 478, 22, 2);
    ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.moveTo(1282, 500); ctx.lineTo(1286, 452); ctx.lineTo(1310, 452); ctx.lineTo(1312, 500); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(1285, 468, 26, 6); ctx.fillStyle = '#0b1220'; ctx.fillRect(1286, 452, 24, 6);
    // bodegas y grúas de cubierta
    for (let i = 0; i < 8; i++) {
      const hx = 1350 + i * 150;
      if (hx > der) break;
      if (i === 0) { ctx.fillStyle = '#0b1220'; ctx.fillRect(hx, 600, 112, 12); ctx.fillStyle = '#7f1d1d'; ctx.fillRect(hx - 4, 586, 8, 26); ctx.fillRect(hx + 108, 586, 8, 26); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(hx + 30, 604, 52, 6); }
      else { ctx.fillStyle = '#7f1d1d'; ctx.fillRect(hx, 596, 112, 16); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(hx, 596, 112, 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 1; k < 4; k++) ctx.fillRect(hx + k * 28, 596, 1.5, 16); }
      if (i < 7) {
        const cx = hx + 131; const ang = 0.95 + 0.06 * Math.sin(t * 0.5 + i);
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(cx - 7, 560, 14, 52); ctx.fillStyle = '#fbbf24'; ctx.fillRect(cx - 10, 546, 20, 16); ctx.fillStyle = '#1e3a5f'; ctx.fillRect(cx + 2, 550, 6, 5);
        const tx = cx + Math.cos(ang) * 110, ty = 554 - Math.sin(ang) * 110;
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, 556); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = 'rgba(203,213,225,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, 585); ctx.stroke();
        ctx.fillStyle = '#334155'; ctx.fillRect(tx - 3, 585, 6, 5);
      }
    }
    ctx.restore();
    // agua en primer plano (cubre la obra viva del casco)
    ctx.fillStyle = G.mar; ctx.fillRect(MUELLE, AGUA + bob * 0.3, Math.max(0, der - MUELLE), 160);
    ctx.strokeStyle = 'rgba(103,232,249,.45)'; ctx.lineWidth = 1.6;
    [AGUA + 2, AGUA + 22, AGUA + 50, AGUA + 86].forEach((y, k) => {
      ctx.beginPath(); const fase = t * (1.2 + k * 0.3) + k;
      for (let x = MUELLE; x <= der; x += 12) { const yy = y + Math.sin(x * 0.045 + fase) * (2 + k); if (x === MUELLE) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      ctx.globalAlpha = alfa * (0.9 - k * 0.18); ctx.stroke();
    });
    ctx.globalAlpha = alfa;
    // brazo del cargador de buques sobre la nave y chute a la bodega 1
    celosia(FAJA[1], FAJA[2]);
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1172, 504); ctx.lineTo(1290, 468); ctx.lineTo(1414, 500); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.fillRect(1408, 500, 12, 44 + bob);
    // sal avanzando por la faja y cayendo a la bodega
    if (t > 3.2 || reducido) {
      ctx.fillStyle = '#f8fafc';
      for (let k = 0; k < 46; k++) {
        const u = ((t * 0.16 + k / 46) % 1); const [x, y, tramo] = enFaja(u);
        ctx.globalAlpha = alfa * (tramo === 2 ? 0.85 : 0.95);
        ctx.beginPath(); ctx.arc(x + (tramo === 2 ? ((k * 7) % 5) - 2 : 0), y - 3.5, tramo === 2 ? 1.8 : 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = alfa;
    }

    // ruma donde descarga el camión (crece con la descarga)
    const h = reducido ? 82 : alturaRuma(t), hw = h * 0.72;
    ruma(RUMA.cx, RUMA.base, h, hw);

    // camión (sale de la pantalla al final: ya no se dibuja)
    const visible = c.cx + L / 2 > izq - 20 && c.cx - L / 2 < der + 20;
    const sentido = c.dir >= 0 ? 1 : -1;
    const mov = vel > 15;
    if (visible) {
      // polvo detrás de las ruedas
      if (mov || (t > T.llega && t < T.giro)) {
        const xr = c.cx - sentido * (L / 2 - 20), fuerza = clamp(vel / 160) || 0.6;
        ctx.fillStyle = '#d6dde8';
        for (let k = 0; k < 8; k++) { const ph = (t * 1.5 + k / 8) % 1; ctx.globalAlpha = alfa * (1 - ph) * 0.3 * fuerza; ctx.beginPath(); ctx.arc(xr - sentido * ph * 70, GT - 4 - ph * 26, 4 + ph * 15, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = alfa;
      }
      // humo del escape
      const xe = c.cx + sentido * (191 - L / 2);
      ctx.fillStyle = '#94a3b8';
      for (let k = 0; k < 4; k++) { const ph = (t * 0.9 + k / 4) % 1; ctx.globalAlpha = alfa * (1 - ph) * (mov ? 0.22 : 0.1); ctx.beginPath(); ctx.arc(xe - sentido * ph * 26, GT - 116 - ph * 34, 3 + ph * 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = alfa;
      const carga = t < T.vacia ? 1 : 1 - clamp((t - T.vacia) / 1.6);
      ctx.save(); ctx.translate(c.cx, GT + (mov ? Math.sin(t * 26) * 0.6 : 0)); ctx.scale(c.dir, 1); ctx.translate(-L / 2, 0);
      camion(c.rot, c.tilt, carga);
      ctx.restore();
      // chorro de sal cayendo a la ruma
      if (t > T.vacia && t < T.baja + 0.2) {
        const xr = c.cx + L / 2 + 4, y0 = GT - 36;
        const fuerza = t < T.baja ? clamp((t - T.vacia) / 0.4) : 1 - clamp((t - T.baja) / 0.2);
        ctx.fillStyle = 'rgba(241,245,249,.5)'; ctx.beginPath(); ctx.moveTo(xr - 2, y0); ctx.quadraticCurveTo(xr + 14, y0 + 10, xr + 22, RUMA.base - h * 0.6); ctx.lineTo(xr + 6, RUMA.base - h * 0.4); ctx.closePath(); ctx.globalAlpha = alfa * fuerza; ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 44; k++) {
          const ph = (t * 2.3 + k * 0.618) % 1; const x = xr + ph * 16 + ((k * 37) % 11) - 3;
          const yFin = RUMA.base - h * Math.max(0, 1 - ((x - RUMA.cx) / hw) ** 2);
          ctx.globalAlpha = alfa * fuerza * (0.55 + 0.45 * ((k * 13) % 7) / 7);
          ctx.beginPath(); ctx.arc(x, y0 + (yFin - y0) * ph * ph, 1.4 + (k % 3) * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#e2e8f0';
        for (let k = 0; k < 5; k++) { const ph = (t * 1.2 + k / 5) % 1; ctx.globalAlpha = alfa * fuerza * (1 - ph) * 0.35; ctx.beginPath(); ctx.arc(xr + 22 + (k - 2) * 12 * ph, RUMA.base - h * 0.55 - ph * 26, 6 + ph * 16, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = alfa;
      }
    }

    // rótulos
    ctx.font = '800 17px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillStyle = 'rgba(186,230,253,.9)';
    ctx.fillText('SALINAS HUACHO', 110, 772);
    ctx.fillText('LOZA DE ACOPIO', 1005, 776);
    ctx.fillText('PUERTO CSPCP', 1520, 800);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;
  }

  const paso = (ahora) => {
    if (!vivo) return;
    const t = reducido ? 11 : (ahora - t0) / 1000;
    const dt = tPrev ? Math.min(0.1, (ahora - tPrev) / 1000) : 0.016; tPrev = ahora;
    dibujar(t, dt);
    if (!reducido) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
  const alCambiar = () => { ajustar(); if (reducido) requestAnimationFrame(paso); };
  window.addEventListener('resize', alCambiar);
  return () => { vivo = false; window.removeEventListener('resize', alCambiar); };
}
