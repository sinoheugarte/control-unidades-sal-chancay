// Presentación de entrada (≈20 s): apertura con aurora y partículas de sal, recorrido del camión tolva
// desde Salinas Huacho hasta el Puerto CSPCP al amanecer y cierre con el título animado.
// Se muestra una vez por sesión del navegador; un clic o una tecla la saltan.
import { escena } from './intro-escena.js?v=__V__';

const DURACION = 20500;

const CSS = `
.ix{position:fixed;inset:0;z-index:1000;overflow:hidden;cursor:pointer;color:#fff;background:#02060f;font-family:Inter,system-ui,sans-serif;
  transition:opacity .9s ease,transform 1.1s cubic-bezier(.32,.72,0,1)}
.ix.fuera{opacity:0;transform:scale(1.08);pointer-events:none}
.ix canvas{position:absolute;inset:0;width:100%;height:100%}
.ix .aur{position:absolute;inset:-20%;opacity:.8}
.ix .aur i{position:absolute;border-radius:50%}
.ix .aur i:nth-child(1){width:55vmax;height:55vmax;left:5%;top:0;background:radial-gradient(circle,#1d4ed8,transparent 65%)}
.ix .aur i:nth-child(2){width:50vmax;height:50vmax;right:0;top:10%;background:radial-gradient(circle,#06b6d4,transparent 65%);animation-delay:-3s}
.ix .aur i:nth-child(3){width:45vmax;height:45vmax;left:30%;bottom:-10%;background:radial-gradient(circle,#7c3aed,transparent 65%);animation-delay:-6s}
@keyframes ix-flota{to{transform:translate(6%,-8%) scale(1.15)}}
.ix .esc{position:absolute;inset:0}
/* Escena 1: logo central con destello, luego sube */
.ix .logo{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:40px;display:grid;place-items:center;
  background:linear-gradient(135deg,#2563eb,#0ea5e9 55%,#06b6d4);box-shadow:0 0 0 1px rgba(255,255,255,.25) inset,0 30px 80px -10px rgba(14,165,233,.8),0 0 120px 20px rgba(56,189,248,.35);
  overflow:hidden;animation:ix-logo-in 1.6s cubic-bezier(.34,1.56,.64,1) .3s both,ix-logo-sube 1.4s cubic-bezier(.65,0,.35,1) 3s forwards}
.ix .logo svg{width:84px;height:84px}
.ix .logo::after{content:"";position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%);transform:translateX(-100%);animation:ix-brillo 1.3s ease 1.6s forwards}
@keyframes ix-logo-in{from{opacity:0;transform:scale(.2) rotate(-25deg)}to{opacity:1;transform:none}}
@keyframes ix-logo-sube{to{transform:translateY(-34vh) scale(.55)}}
@keyframes ix-brillo{to{transform:translateX(100%)}}
.ix .anillo{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;border:2px solid rgba(125,211,252,.7);opacity:0;animation:ix-onda 2s ease-out .9s forwards}
.ix .anillo.b{animation-delay:1.3s;border-color:rgba(167,139,250,.6)}
@keyframes ix-onda{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(6)}}
.ix canvas.mundo{z-index:0}
@keyframes ix-aparece{to{opacity:1}}
/* Escena 3: título */
.ix .tit{position:absolute;left:0;right:0;top:24%;text-align:center;pointer-events:none}
.ix .tit h1{margin:0;font-size:clamp(30px,5.6vw,76px);font-weight:900;letter-spacing:-.04em;line-height:1}
.ix .tit h1 span{display:inline-block;opacity:0;transform:translateY(40px) rotateX(70deg);
  background:linear-gradient(90deg,#fff 0%,#bae6fd 30%,#c4b5fd 60%,#fff 90%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:ix-letra 1s cubic-bezier(.22,1,.36,1) forwards,ix-shimmer 3s linear 16s infinite}
@keyframes ix-letra{to{opacity:1;transform:none}}
@keyframes ix-shimmer{to{background-position:-300% 0}}
.ix .tit .sub{display:flex;justify-content:center;gap:clamp(10px,2vw,26px);margin-top:16px;flex-wrap:wrap}
.ix .tit .sub b{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;font-size:clamp(11px,1.3vw,15px);letter-spacing:.18em;text-transform:uppercase;font-weight:750;
  background:rgba(15,23,42,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 10px 30px -10px rgba(14,165,233,.6);
  opacity:0;transform:translateY(16px) scale(.9);animation:ix-chip .7s cubic-bezier(.34,1.56,.64,1) forwards}
.ix .tit .sub b i{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 12px var(--c)}
@keyframes ix-chip{to{opacity:1;transform:none}}
.ix .tit .emp{margin-top:14px;color:#9fb3cf;font-size:clamp(10px,1.1vw,13px);letter-spacing:.32em;text-transform:uppercase;opacity:0;animation:ix-aparece 1.2s ease 15.6s forwards}
.ix .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.85),transparent 60%);opacity:0;pointer-events:none;animation:ix-flash 1.4s ease 19.2s forwards}
@keyframes ix-flash{0%{opacity:0}40%{opacity:.85}100%{opacity:0}}
.ix .saltar{position:absolute;right:20px;bottom:18px;display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;font-size:12px;letter-spacing:.06em;
  color:#cbd5e1;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);opacity:0;animation:ix-aparece .6s ease 1.2s forwards}
.ix .prog{position:absolute;left:50%;bottom:0;width:min(320px,60vw);height:3px;transform:translateX(-50%);background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}
.ix .prog i{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#a78bfa,#f472b6);transform-origin:left;animation:ix-prog ${DURACION}ms linear forwards}
@keyframes ix-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.ix .controles{position:absolute;right:calc(18px + var(--sar, 0px));bottom:calc(16px + var(--sab, 0px));display:flex;gap:8px;opacity:0;animation:ix-aparece .6s ease .8s forwards}
.ix .controles button{font:inherit;font-size:12px;font-weight:650;letter-spacing:.04em;color:#e2e8f0;cursor:pointer;padding:8px 15px;border-radius:99px;border:0;
  background:rgba(15,23,42,.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);transition:background-color .2s ease,transform .15s ease}
.ix .controles button:hover{background:rgba(255,255,255,.18)}.ix .controles button:active{transform:scale(.95)}
.ix .controles .snd.on{background:rgba(56,189,248,.25);box-shadow:inset 0 0 0 1px rgba(56,189,248,.6)}
.ix.tapa{display:grid;place-items:center;z-index:1001}
.ix .tapa-c{position:relative;display:grid;justify-items:center;gap:18px;text-align:center;padding:24px}
.ix .logo.fijo{position:relative;left:auto;top:auto;margin:0;width:120px;height:120px;border-radius:32px;box-shadow:0 0 0 1px rgba(255,255,255,.25) inset,0 24px 60px -12px rgba(14,165,233,.8);animation:ix-latido 2.4s ease-in-out infinite}
.ix .logo.fijo svg{width:66px;height:66px}
.ix .logo.fijo::after{animation:ix-brillo 1.3s ease .4s forwards}
@keyframes ix-latido{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
.ix .tapa-c h2{margin:6px 0 0;font-size:clamp(26px,4.4vw,46px);font-weight:900;letter-spacing:-.03em;
  background:linear-gradient(90deg,#fff,#bae6fd 40%,#c4b5fd 70%,#fff);-webkit-background-clip:text;background-clip:text;color:transparent}
.ix .tapa-go{font:inherit;font-size:17px;font-weight:750;color:#fff;cursor:pointer;border:0;padding:15px 30px;border-radius:99px;margin-top:8px;
  background:linear-gradient(135deg,#2563eb,#06b6d4);box-shadow:0 16px 40px -12px rgba(14,165,233,.75),inset 0 0 0 1px rgba(255,255,255,.25);
  display:inline-flex;align-items:center;gap:10px;animation:ix-pulso 1.8s ease-in-out infinite}
.ix .tapa-go span{font-size:14px}
.ix .tapa-go:active{transform:scale(.96)}
@keyframes ix-pulso{0%,100%{box-shadow:0 16px 40px -12px rgba(14,165,233,.75),0 0 0 0 rgba(56,189,248,.45)}50%{box-shadow:0 16px 40px -12px rgba(14,165,233,.75),0 0 0 14px rgba(56,189,248,0)}}
.ix .tapa-c p{margin:0;color:#9fb3cf;font-size:13px;letter-spacing:.12em;text-transform:uppercase}
@media (prefers-reduced-motion:reduce){.ix *,.ix *::before,.ix *::after{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
`;

const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h11V7H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';

/* Partículas: estrellas que titilan y granos de sal que suben con brillo */
function particulas(canvas, reducido) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0;
  const ajustar = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w; canvas.height = h; };
  ajustar();
  // Sprite de brillo por color (se dibuja una vez y se reutiliza: mucho más liviano que shadowBlur)
  const sprite = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.25, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c; };
  const SP = [sprite('255,255,255'), sprite('125,211,252'), sprite('196,181,253')];
  const N = reducido ? 40 : Math.min(matchMedia('(pointer: coarse)').matches ? 60 : 130, Math.round((w * h) / 14000));
  const ps = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 5 + 3, v: Math.random() * 0.45 + 0.1, f: Math.random() * Math.PI * 2, s: SP[Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 1 : 2] }));
  let vivo = true; const t0 = performance.now();
  const paso = (t) => {
    if (!vivo) return;
    const e = (t - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      if (!reducido) { p.y -= p.v; p.x += Math.sin(e + p.f) * 0.15; if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; } }
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(e * 1.6 + p.f));
      ctx.drawImage(p.s, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
  window.addEventListener('resize', ajustar);
  return () => { vivo = false; window.removeEventListener('resize', ajustar); };
}

/* =====================================================================
   Música de fondo generada en el navegador (Web Audio, sin archivos):
   acordes cinematográficos, arpegio, bajo, percusión suave y efectos
   sincronizados con la escena (logo, descarga de sal y título).
   ===================================================================== */
function musica(t0, ctx) {
  if (!ctx) return null;
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  // Reverberación (respuesta al impulso generada con ruido decreciente)
  const rev = ctx.createConvolver();
  const largo = Math.round(ctx.sampleRate * 1.8); const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 2.6); }
  rev.buffer = ir; const revG = ctx.createGain(); revG.gain.value = 0.45; rev.connect(revG).connect(master);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(rev);
  const f = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // Progresión (2 s por compás): C – G/B – Am – F – C – G – Am – F – Dm – G
  const ACORDES = [[48, 60, 64, 67, 71], [47, 59, 62, 67, 74], [45, 57, 60, 64, 72], [41, 57, 60, 65, 69], [48, 60, 64, 67, 72], [43, 59, 62, 67, 71], [45, 57, 60, 64, 69], [41, 53, 60, 65, 69], [50, 57, 62, 65, 69], [43, 55, 62, 67, 71]];
  const BAR = 2;
  const nota = (tipo, freq, t, dur, vol, { ataque = 0.02, corte = 2400, detune = 0, destino = bus } = {}) => {
    const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = corte;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(destino); o.start(t); o.stop(t + dur + 0.05);
  };
  const RUIDO = ctx.createBuffer(1, ctx.sampleRate * 2.5, ctx.sampleRate);
  { const d = RUIDO.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const ruido = (t, dur, vol, frec, q = 0.8, sube = null) => {
    const s = ctx.createBufferSource(); s.buffer = RUIDO; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = frec; bp.Q.value = q;
    if (sube) bp.frequency.exponentialRampToValueAtTime(sube, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(bus); s.start(t); s.stop(t + dur);
  };
  const bombo = (t, vol = 0.55) => {
    const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g).connect(master); o.start(t); o.stop(t + 0.45);
  };
  const campana = (t, freq, vol = 0.12) => { [1, 2.76, 5.4].forEach((m, i) => nota('sine', freq * m, t, 3.5 - i, vol / (i + 1), { ataque: 0.005, corte: 9000 })); };
  let programado = false;
  const programar = () => {
    if (programado) return; programado = true;
    const ya = Math.max(0, (performance.now() - t0) / 1000); // segundos de escena transcurridos al empezar a sonar
    const T = (s) => ctx.currentTime + 0.05 + (s - ya);
    master.gain.setValueAtTime(0.0001, ctx.currentTime); master.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 1.5);
    ACORDES.forEach((ac, b) => {
      const ini = b * BAR; if (ini + BAR < ya) return;
      const t = T(ini);
      // Pad: tres osciladores desafinados por nota
      ac.slice(1).forEach((n) => [-6, 6].forEach((dt) => nota('sawtooth', f(n), t, BAR + 0.6, 0.024, { ataque: 0.6, corte: 1400 + b * 120, detune: dt })));
      nota('sine', f(ac[0] - 12), t, BAR, 0.22, { ataque: 0.05, corte: 400 }); // bajo
      if (ini >= 3) { // arpegio y pulso desde que arranca el camión
        for (let k = 0; k < 8; k++) nota('triangle', f(ac[1 + (k % 4)] + 12), t + k * 0.25, 0.3, 0.05, { ataque: 0.01, corte: 3200 });
        bombo(t); bombo(t + 1);
        ruido(t + 0.5, 0.12, 0.05, 7000, 1.2); ruido(t + 1.5, 0.12, 0.05, 7000, 1.2);
      }
    });
    if (ya < 2.9) ruido(T(2.9), 1.4, 0.22, 600, 0.7, 5000);        // "whoosh" al subir el logo
    if (ya < 1.6) campana(T(1.6), f(84), 0.1);                      // destello del logo
    if (ya < 10.3) { ruido(T(10.3), 2.2, 0.3, 300, 0.6); ruido(T(10.5), 1.8, 0.18, 2400, 0.9); } // descarga de sal
    if (ya < 13.2) { campana(T(13.2), f(76), 0.14); campana(T(13.6), f(83), 0.1); }       // título
    if (ya < 18.9) { bombo(T(18.9), 0.8); ruido(T(18.9), 1.6, 0.2, 1800, 0.5, 200); }      // cierre
    const fin = T(DURACION / 1000);
    master.gain.setValueAtTime(0.8, Math.max(ctx.currentTime + 0.1, fin - 2)); master.gain.exponentialRampToValueAtTime(0.0001, fin + 0.6);
  };
  return {
    iniciar: async () => { try { await ctx.resume(); } catch { /* sin permiso */ } if (ctx.state === 'running') { programar(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.3); } },
    silenciar: () => { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); setTimeout(() => ctx.suspend(), 400); },
    sonando: () => ctx.state === 'running',
    terminar: (seg) => { try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.0001, ctx.currentTime, seg / 3); setTimeout(() => ctx.close(), seg * 1000 + 300); } catch { /* */ } },
  };
}

/* Los navegadores (y el visor de Android) sólo permiten sonido después de un toque del usuario.
   Si el audio ya puede sonar (p. ej. en la app nativa) la presentación arranca sola; si no, se muestra
   una portada "Toca para comenzar": ese toque habilita la música y arranca la presentación. */
export function mostrarIntro() {
  try { if (sessionStorage.getItem('intro-vista')) return; sessionStorage.setItem('intro-vista', '1'); } catch { /* sin storage */ }
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const AC = window.AudioContext || window.webkitAudioContext;
  if (reducido || !AC) return presentar(st, reducido, null);
  // latencyHint 'playback': búfer de audio más grande, sin microcortes cuando la animación exige al procesador
  const nuevoAudio = () => { try { return new AC({ latencyHint: 'playback' }); } catch { try { return new AC(); } catch { return null; } } };
  // App nativa (Android): el sonido está permitido sin toque, arranca directo
  if (window.Capacitor?.isNativePlatform?.()) { const a = nuevoAudio(); a?.resume?.().catch(() => {}); return presentar(st, reducido, a); }
  // Web (PC y celular): portada "Toca para comenzar"; el toque habilita el sonido
  const tapa = document.createElement('div');
  tapa.className = 'ix tapa';
  tapa.innerHTML = `<div class="aur"><i></i><i></i><i></i></div>
    <div class="tapa-c"><div class="logo fijo">${LOGO}</div><h2>Control de Unidades</h2>
      <button type="button" class="tapa-go"><span>▶</span> Toca para comenzar</button>
      <p>Presentación con música</p></div>
    <div class="controles" style="animation-delay:0s"><button type="button" class="skip">Saltar ›</button></div>`;
  document.body.appendChild(tapa);
  let listo = false;
  const arrancar = (conSonido) => {
    if (listo) return; listo = true;
    clearTimeout(tEspera);
    let a = null;
    if (conSonido) {
      a = nuevoAudio();                       // creado dentro del toque: el navegador lo deja sonar
      try { a?.resume(); } catch { /* */ }
      desbloquearAudio();
    } else a = nuevoAudio();                  // sin toque: queda en pausa hasta "Activar música"
    presentar(st, reducido, a);
    tapa.classList.add('fuera');
    setTimeout(() => tapa.remove(), 1000);
  };
  tapa.addEventListener('click', (e) => {
    if (e.target.closest('.skip')) { listo = true; clearTimeout(tEspera); tapa.classList.add('fuera'); setTimeout(() => { tapa.remove(); st.remove(); }, 900); return; }
    arrancar(true);
  });
  // Sin toque en 15 s: arranca igual (sin sonido; el botón "Activar música" sigue disponible)
  const tEspera = setTimeout(() => arrancar(false), 15000);
}

/* En celulares (sobre todo iPhone en modo silencio) el audio web queda mudo hasta que suena un elemento
   <audio>: se reproduce un sonido vacío de 0,1 s dentro del toque para abrir la salida de audio. */
function desbloquearAudio() {
  try {
    const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const el = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    el.setAttribute('playsinline', ''); el.volume = 0.01;
    el.play().catch(() => {});
  } catch { /* */ }
}

function presentar(st, reducido, actx) {
  const titulo = 'Control de Unidades';
  const el = document.createElement('div');
  el.className = 'ix';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="aur"><i></i><i></i><i></i></div><canvas></canvas>
    <div class="esc"><canvas class="mundo"></canvas><div class="anillo"></div><div class="anillo b"></div><div class="logo">${LOGO}</div>
      <div class="tit"><h1>${[...titulo].map((ch, i) => `<span style="animation-delay:${(13.2 + i * 0.06).toFixed(3)}s,16s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h1>
        <div class="sub">${[['Despacho', '#38bdf8'], ['Acopio', '#34d399'], ['Embarque', '#a78bfa']].map(([t, c], i) => `<b style="--c:${c};animation-delay:${(14.6 + i * 0.3).toFixed(2)}s"><i></i>${t}</b>`).join('')}</div>
        <div class="emp">Pacífico Despachos · Acopio de sal · Chancay</div></div></div>
    <div class="flash"></div><div class="controles"><button type="button" class="snd">🔊 Activar música</button><button type="button" class="skip">Saltar ›</button></div><div class="prog"><i></i></div>`;
  document.body.appendChild(el);
  const parar = particulas(el.querySelector('canvas'), reducido);
  const t0 = performance.now();
  const pararEscena = escena(el.querySelector('canvas.mundo'), t0, reducido);
  const audio = reducido ? null : musica(t0, actx);
  const bSnd = el.querySelector('.snd');
  const pintarSnd = () => { const on = audio?.sonando(); bSnd.classList.toggle('on', !!on); bSnd.textContent = on ? '🔊 Música' : '🔇 Activar música'; };
  if (!audio) bSnd.remove(); else { audio.iniciar().then(pintarSnd); }
  let fuera = false;
  const cerrar = () => {
    if (fuera) return; fuera = true;
    el.classList.add('fuera');
    document.removeEventListener('keydown', tecla);
    audio?.terminar(1.1);
    setTimeout(() => { parar(); pararEscena(); el.remove(); st.remove(); }, 1200);
  };
  const tecla = (e) => { if (e.key === 'Escape' || e.key === 'Enter') cerrar(); else if (audio && !audio.sonando()) audio.iniciar().then(pintarSnd); };
  // Un toque en la escena activa la música (los navegadores no permiten sonido sin un gesto); "Saltar" cierra
  el.addEventListener('click', (e) => {
    if (e.target.closest('.skip')) return cerrar();
    if (e.target.closest('.snd')) { if (audio.sonando()) audio.silenciar(); else audio.iniciar(); return setTimeout(pintarSnd, 50); }
    if (audio && !audio.sonando()) { audio.iniciar().then(pintarSnd); return; }
  });
  document.addEventListener('keydown', tecla);
  setTimeout(cerrar, reducido ? 1500 : DURACION);
}
