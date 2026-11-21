// Presentación de entrada (≈8 s): apertura con aurora y partículas de sal, recorrido del camión tolva
// desde Salinas Huacho hasta el Puerto CSPCP al amanecer y cierre con el título animado.
// Se muestra una vez por sesión del navegador; un clic o una tecla la saltan.
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
.ix svg.mundo{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
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
/* Escena 2: amanecer, mundo y camión */
.ix .mundo{opacity:0;animation:ix-aparece 1.6s ease 3s forwards}
@keyframes ix-aparece{to{opacity:1}}
.ix .sol{transform-box:fill-box;transform-origin:center;animation:ix-sol 7s cubic-bezier(.22,1,.36,1) 3.2s both}
@keyframes ix-sol{from{transform:translateY(140px);opacity:.2}to{transform:none;opacity:1}}
.ix .cielo{opacity:0;animation:ix-aparece 4s ease 3.2s forwards}
.ix .camion{animation:ix-ruta 14s linear 3.5s both}
@keyframes ix-ruta{
  0%{transform:translateX(-300px);animation-timing-function:cubic-bezier(.3,0,.25,1)}
  39%{transform:translateX(830px)}
  64%{transform:translateX(830px);animation-timing-function:cubic-bezier(.55,0,.75,.6)}
  100%{transform:translateX(-520px)}}
.ix .gira{transform-box:fill-box;transform-origin:center;animation:ix-vuelta 14s step-end 3.5s both}
@keyframes ix-vuelta{0%{transform:none}64%{transform:scale(-1,1)}100%{transform:scale(-1,1)}}
.ix .tolva{transform-box:fill-box;transform-origin:left bottom;animation:ix-volteo 3.4s cubic-bezier(.45,0,.25,1) 9.1s both}
@keyframes ix-volteo{0%{transform:none}28%{transform:rotate(-30deg)}72%{transform:rotate(-30deg)}100%{transform:none}}
.ix .carga{animation:ix-vacia 3.4s ease 9.1s both}
@keyframes ix-vacia{0%,30%{opacity:1;transform:none}70%,100%{opacity:0;transform:translate(-30px,10px) scale(.6)}}
.ix .chorro{opacity:0;animation:ix-visible 2.3s linear 9.8s}
@keyframes ix-visible{0%,100%{opacity:1}}
.ix .chorro circle{animation:ix-cae .55s ease-in infinite}
@keyframes ix-cae{from{transform:translateY(-30px);opacity:1}to{transform:translateY(40px);opacity:.2}}
.ix .pila{transform-box:fill-box;transform-origin:center bottom;transform:scaleY(0);animation:ix-pila 2.4s cubic-bezier(.22,1,.36,1) 9.9s forwards}
@keyframes ix-pila{to{transform:none}}
.ix .polvopuerto circle{opacity:0;transform-box:fill-box;transform-origin:center;animation:ix-nube 1.6s ease-out 10s 2}
@keyframes ix-nube{0%{opacity:.6;transform:scale(.3)}100%{opacity:0;transform:translate(var(--dx),-30px) scale(3)}}
.ix .rueda{transform-box:fill-box;transform-origin:center;animation:ix-ruedas 14s linear 3.5s both}
@keyframes ix-ruedas{0%{transform:none;animation-timing-function:cubic-bezier(.3,0,.25,1)}39%{transform:rotate(4300deg)}64%{transform:rotate(4300deg);animation-timing-function:cubic-bezier(.55,0,.75,.6)}100%{transform:rotate(9200deg)}}
@keyframes ix-gira{to{transform:rotate(360deg)}}
.ix .rebote{animation:ix-rebote .32s ease-in-out infinite alternate}
@keyframes ix-rebote{to{transform:translateY(-2px)}}
.ix .polvo circle{transform-box:fill-box;transform-origin:center;animation:ix-polvo 1s ease-out infinite}
@keyframes ix-polvo{0%{opacity:.7;transform:translate(0,0) scale(.4)}100%{opacity:0;transform:translate(-70px,-26px) scale(2.4)}}
.ix .lineas line{stroke-dasharray:40 400;animation:ix-viento .9s linear infinite}
@keyframes ix-viento{from{stroke-dashoffset:0}to{stroke-dashoffset:440}}
.ix .gruabrazo{transform-box:view-box;transform-origin:1390px 520px;animation:ix-grua 4s ease-in-out 4s infinite alternate}
@keyframes ix-grua{to{transform:rotate(-8deg)}}
.ix .nave{animation:ix-nave 3s ease-in-out infinite alternate}
@keyframes ix-nave{to{transform:translateY(5px) rotate(.4deg)}}
.ix .ola{animation:ix-ola 4s linear infinite}
@keyframes ix-ola{to{transform:translateX(-120px)}}
.ix .brillo{transform-box:fill-box;transform-origin:center;opacity:0;animation:ix-chispa 1.6s ease-in-out infinite}
@keyframes ix-chispa{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1)}}
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
.ix .controles{position:absolute;right:18px;bottom:16px;display:flex;gap:8px;opacity:0;animation:ix-aparece .6s ease .8s forwards}
.ix .controles button{font:inherit;font-size:12px;font-weight:650;letter-spacing:.04em;color:#e2e8f0;cursor:pointer;padding:8px 15px;border-radius:99px;border:0;
  background:rgba(15,23,42,.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);transition:background-color .2s ease,transform .15s ease}
.ix .controles button:hover{background:rgba(255,255,255,.18)}.ix .controles button:active{transform:scale(.95)}
.ix .controles .snd.on{background:rgba(56,189,248,.25);box-shadow:inset 0 0 0 1px rgba(56,189,248,.6)}
@media (prefers-reduced-motion:reduce){.ix *,.ix *::before,.ix *::after{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
`;

const CAMION = `
<g class="camion"><g class="gira"><g class="rebote">
  <g class="polvo" fill="#e2e8f0">${[0, 1, 2, 3, 4].map((i) => `<circle cx="-6" cy="${58 - (i % 2) * 6}" r="${6 + i}" style="animation-delay:${i * 0.18}s"/>`).join('')}</g>
  <g class="tolva">
    <path d="M0 22 L18 0 H170 L186 22 V58 H0 Z" fill="url(#ix-tolva)"/>
    <path d="M10 14 H176" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
    <path class="carga" d="M22 0 Q95 -30 168 0 Z" fill="url(#ix-sal)"/>
  </g>
  <rect x="186" y="34" width="14" height="10" rx="2" fill="#0f172a"/>
  <path d="M198 58 V12 Q198 4 206 4 H240 Q252 4 256 16 L264 36 V58 Z" fill="url(#ix-cab)"/>
  <path d="M214 12 H238 Q246 12 249 20 L254 34 H214 Z" fill="#bae6fd" opacity=".9"/>
  <rect x="256" y="44" width="10" height="6" rx="2" fill="#fde68a"/>
  <path d="M266 47 L420 30 L420 64 Z" fill="url(#ix-faro)" opacity=".55"/>
  ${[40, 72, 150, 236].map((x) => `<g transform="translate(${x} 62)"><g class="rueda"><circle r="13" fill="#0b1220"/><circle r="6.5" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#cbd5e1" stroke-width="2"/></g></g>`).join('')}
</g></g></g>`;

const MUNDO = `
<svg class="mundo" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs>
    <linearGradient id="ix-cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1b3f" stop-opacity="0"/><stop offset=".55" stop-color="#7c3aed" stop-opacity=".35"/><stop offset=".8" stop-color="#f97316" stop-opacity=".45"/><stop offset="1" stop-color="#fbbf24" stop-opacity=".55"/></linearGradient>
    <radialGradient id="ix-solg"><stop offset="0" stop-color="#fff7cc"/><stop offset=".35" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316" stop-opacity="0"/></radialGradient>
    <linearGradient id="ix-sal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#93c5fd"/></linearGradient>
    <linearGradient id="ix-cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
    <linearGradient id="ix-tolva" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/></linearGradient>
    <linearGradient id="ix-faro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></linearGradient>
    <linearGradient id="ix-mar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#082f49"/></linearGradient>
    <linearGradient id="ix-pista" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38bdf8" stop-opacity="0"/><stop offset=".5" stop-color="#38bdf8" stop-opacity=".7"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>
  </defs>
  <rect class="cielo" x="-800" y="260" width="3200" height="460" fill="url(#ix-cielo)"/>
  <circle class="sol" cx="800" cy="640" r="190" fill="url(#ix-solg)"/>
  <!-- Salinas Huacho -->
  <g>
    <path d="M60 690 L210 520 L360 690 Z" fill="url(#ix-sal)"/><path d="M230 690 L330 575 L440 690 Z" fill="url(#ix-sal)" opacity=".8"/>
    <path d="M150 600 L210 520 L240 560" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
    ${[[200, 560], [290, 610], [130, 640], [340, 650], [250, 540]].map(([x, y], i) => `<path class="brillo" d="M${x} ${y - 8} L${x + 2} ${y - 2} L${x + 8} ${y} L${x + 2} ${y + 2} L${x} ${y + 8} L${x - 2} ${y + 2} L${x - 8} ${y} L${x - 2} ${y - 2} Z" fill="#fff" style="animation-delay:${2 + i * 0.35}s"/>`).join('')}
    <text x="210" y="730" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="4" fill="#bae6fd" opacity=".85">SALINAS HUACHO</text>
  </g>
  <!-- Puerto CSPCP: mar, nave y grúa -->
  <g>
    <rect x="1220" y="690" width="1200" height="400" fill="url(#ix-mar)"/>
    <path class="ola" d="M1220 700 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#67e8f9" stroke-opacity=".6" stroke-width="2"/>
    <g class="nave"><path d="M1330 690 L1580 690 L1560 728 L1350 728 Z" fill="#1e293b"/><rect x="1360" y="660" width="40" height="30" fill="#f97316"/><rect x="1402" y="660" width="40" height="30" fill="#2563eb"/><rect x="1444" y="660" width="40" height="30" fill="#10b981"/><rect x="1500" y="630" width="44" height="60" fill="#e2e8f0"/><rect x="1508" y="640" width="28" height="8" fill="#38bdf8"/></g>
    <g stroke="#7dd3fc" stroke-width="7" stroke-linecap="round" fill="none"><path d="M1390 690 V520"/><path d="M1360 690 L1390 600 L1420 690"/></g>
    <g class="gruabrazo" stroke="#7dd3fc" stroke-width="6" stroke-linecap="round" fill="none"><path d="M1390 520 H1560 M1390 520 H1330"/><path d="M1520 520 V585"/><rect x="1505" y="585" width="30" height="18" fill="#fbbf24" stroke="none"/></g>
    <text x="1430" y="760" text-anchor="middle" font-size="18" font-weight="800" letter-spacing="4" fill="#bae6fd" opacity=".85">PUERTO CSPCP</text>
  </g>
  <!-- loza del puerto: aquí se descarga la sal -->
  <rect x="960" y="682" width="300" height="14" rx="3" fill="#94a3b8"/><rect x="960" y="682" width="300" height="3" fill="#e2e8f0" opacity=".7"/>
  <text x="1110" y="742" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="3" fill="#cbd5e1" opacity=".7">LOZA</text>
  <path class="pila" d="M985 682 Q1035 600 1085 682 Z" fill="url(#ix-sal)"/>
  <g class="chorro" fill="#f8fafc">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${1068 + (i % 3) * 6}" cy="${640 + (i % 4) * 8}" r="${2 + (i % 3)}" style="animation-delay:${(i * 0.07).toFixed(2)}s"/>`).join('')}</g>
  <g class="polvopuerto" fill="#e2e8f0">${[[-40, 1000], [30, 1050], [-20, 1080], [50, 1030]].map(([dx, x], i) => `<circle cx="${x}" cy="676" r="10" style="--dx:${dx}px;animation-delay:${(10 + i * 0.25).toFixed(2)}s"/>`).join('')}</g>
  <!-- carretera -->
  <rect x="-800" y="690" width="2060" height="4" fill="url(#ix-pista)"/>
  <rect x="-800" y="694" width="2020" height="400" fill="#050b18" opacity=".55"/>
  <line x1="0" y1="712" x2="1260" y2="712" stroke="#38bdf8" stroke-opacity=".35" stroke-width="3" stroke-dasharray="26 18"/>
  <g class="lineas" stroke="#bae6fd" stroke-opacity=".35" stroke-width="2">${[600, 640, 670].map((y, i) => `<line x1="0" y1="${y}" x2="1260" y2="${y}" style="animation-delay:${i * 0.3}s"/>`).join('')}</g>
  <g transform="translate(250 620)">${CAMION}</g>
</svg>`;

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
  const N = reducido ? 40 : Math.min(130, Math.round((w * h) / 14000));
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
function musica(t0) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  // Reverberación (respuesta al impulso generada con ruido decreciente)
  const rev = ctx.createConvolver();
  const largo = ctx.sampleRate * 2.8; const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
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
      ac.slice(1).forEach((n) => [-7, 0, 7].forEach((dt) => nota('sawtooth', f(n), t, BAR + 0.6, 0.018, { ataque: 0.6, corte: 1400 + b * 120, detune: dt })));
      nota('sine', f(ac[0] - 12), t, BAR, 0.22, { ataque: 0.05, corte: 400 }); // bajo
      if (ini >= 3) { // arpegio y pulso desde que arranca el camión
        for (let k = 0; k < 8; k++) nota('triangle', f(ac[1 + (k % 4)] + 12), t + k * 0.25, 0.3, 0.05, { ataque: 0.01, corte: 3200 });
        bombo(t); bombo(t + 1);
        ruido(t + 0.5, 0.12, 0.05, 7000, 1.2); ruido(t + 1.5, 0.12, 0.05, 7000, 1.2);
      }
    });
    if (ya < 2.9) ruido(T(2.9), 1.4, 0.22, 600, 0.7, 5000);        // "whoosh" al subir el logo
    if (ya < 1.6) campana(T(1.6), f(84), 0.1);                      // destello del logo
    if (ya < 9.8) { ruido(T(9.8), 2.4, 0.3, 300, 0.6); ruido(T(10.1), 2, 0.18, 2400, 0.9); } // descarga de sal
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

export function mostrarIntro() {
  try { if (sessionStorage.getItem('intro-vista')) return; sessionStorage.setItem('intro-vista', '1'); } catch { /* sin storage */ }
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const titulo = 'Control de Unidades';
  const el = document.createElement('div');
  el.className = 'ix';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="aur"><i></i><i></i><i></i></div><canvas></canvas>
    <div class="esc">${MUNDO}<div class="anillo"></div><div class="anillo b"></div><div class="logo">${LOGO}</div>
      <div class="tit"><h1>${[...titulo].map((ch, i) => `<span style="animation-delay:${(13.2 + i * 0.06).toFixed(3)}s,16s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h1>
        <div class="sub">${[['Despacho', '#38bdf8'], ['Acopio', '#34d399'], ['Embarque', '#a78bfa']].map(([t, c], i) => `<b style="--c:${c};animation-delay:${(14.6 + i * 0.3).toFixed(2)}s"><i></i>${t}</b>`).join('')}</div>
        <div class="emp">Pacífico Despachos · Acopio de sal · Chancay</div></div></div>
    <div class="flash"></div><div class="controles"><button type="button" class="snd">🔊 Activar música</button><button type="button" class="skip">Saltar ›</button></div><div class="prog"><i></i></div>`;
  document.body.appendChild(el);
  const parar = particulas(el.querySelector('canvas'), reducido);
  const t0 = performance.now();
  const audio = reducido ? null : musica(t0);
  const bSnd = el.querySelector('.snd');
  const pintarSnd = () => { const on = audio?.sonando(); bSnd.classList.toggle('on', !!on); bSnd.textContent = on ? '🔊 Música' : '🔇 Activar música'; };
  if (!audio) bSnd.remove(); else { audio.iniciar().then(pintarSnd); }
  let fuera = false;
  const cerrar = () => {
    if (fuera) return; fuera = true;
    el.classList.add('fuera');
    document.removeEventListener('keydown', tecla);
    audio?.terminar(1.1);
    setTimeout(() => { parar(); el.remove(); st.remove(); }, 1200);
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
