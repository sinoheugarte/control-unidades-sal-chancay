// Presentación de entrada (≈8 s): apertura con aurora y partículas de sal, recorrido del camión tolva
// desde Salinas Huacho hasta el Puerto CSPCP al amanecer y cierre con el título animado.
// Se muestra una vez por sesión del navegador; un clic o una tecla la saltan.
const DURACION = 8200;

const CSS = `
.ix{position:fixed;inset:0;z-index:1000;overflow:hidden;cursor:pointer;color:#fff;background:#02060f;font-family:Inter,system-ui,sans-serif;
  transition:opacity .9s ease,transform 1.1s cubic-bezier(.32,.72,0,1),filter .9s ease}
.ix.fuera{opacity:0;transform:scale(1.12);filter:blur(10px);pointer-events:none}
.ix canvas{position:absolute;inset:0;width:100%;height:100%}
.ix .aur{position:absolute;inset:-20%;filter:blur(70px);opacity:.75}
.ix .aur i{position:absolute;border-radius:50%;mix-blend-mode:screen;animation:ix-flota 9s ease-in-out infinite alternate}
.ix .aur i:nth-child(1){width:55vmax;height:55vmax;left:5%;top:0;background:radial-gradient(circle,#1d4ed8,transparent 65%)}
.ix .aur i:nth-child(2){width:50vmax;height:50vmax;right:0;top:10%;background:radial-gradient(circle,#06b6d4,transparent 65%);animation-delay:-3s}
.ix .aur i:nth-child(3){width:45vmax;height:45vmax;left:30%;bottom:-10%;background:radial-gradient(circle,#7c3aed,transparent 65%);animation-delay:-6s}
@keyframes ix-flota{to{transform:translate(6%,-8%) scale(1.15)}}
.ix .esc{position:absolute;inset:0}
.ix svg.mundo{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
/* Escena 1: logo central con destello, luego sube */
.ix .logo{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:40px;display:grid;place-items:center;
  background:linear-gradient(135deg,#2563eb,#0ea5e9 55%,#06b6d4);box-shadow:0 0 0 1px rgba(255,255,255,.25) inset,0 30px 80px -10px rgba(14,165,233,.8),0 0 120px 20px rgba(56,189,248,.35);
  overflow:hidden;animation:ix-logo-in 1.1s cubic-bezier(.34,1.56,.64,1) .15s both,ix-logo-sube 1s cubic-bezier(.65,0,.35,1) 1.9s forwards}
.ix .logo svg{width:84px;height:84px}
.ix .logo::after{content:"";position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%);transform:translateX(-100%);animation:ix-brillo 1.1s ease .9s forwards}
@keyframes ix-logo-in{from{opacity:0;transform:scale(.2) rotate(-25deg)}to{opacity:1;transform:none}}
@keyframes ix-logo-sube{to{transform:translateY(-34vh) scale(.55)}}
@keyframes ix-brillo{to{transform:translateX(100%)}}
.ix .anillo{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;border:2px solid rgba(125,211,252,.7);opacity:0;animation:ix-onda 1.4s ease-out .5s forwards}
.ix .anillo.b{animation-delay:.75s;border-color:rgba(167,139,250,.6)}
@keyframes ix-onda{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(6)}}
/* Escena 2: amanecer, mundo y camión */
.ix .mundo{opacity:0;animation:ix-aparece 1s ease 1.9s forwards}
@keyframes ix-aparece{to{opacity:1}}
.ix .sol{transform-box:fill-box;transform-origin:center;animation:ix-sol 4.5s cubic-bezier(.22,1,.36,1) 2s both}
@keyframes ix-sol{from{transform:translateY(140px);opacity:.2}to{transform:none;opacity:1}}
.ix .cielo{opacity:0;animation:ix-aparece 3s ease 2.2s forwards}
.ix .camion{animation:ix-ruta 4.2s cubic-bezier(.45,.05,.25,1) 2.3s both}
@keyframes ix-ruta{from{transform:translateX(-260px)}to{transform:translateX(830px)}}
.ix .rueda{transform-box:fill-box;transform-origin:center;animation:ix-gira .45s linear infinite}
@keyframes ix-gira{to{transform:rotate(360deg)}}
.ix .rebote{animation:ix-rebote .32s ease-in-out infinite alternate}
@keyframes ix-rebote{to{transform:translateY(-2px)}}
.ix .polvo circle{transform-box:fill-box;transform-origin:center;animation:ix-polvo 1s ease-out infinite}
@keyframes ix-polvo{0%{opacity:.7;transform:translate(0,0) scale(.4)}100%{opacity:0;transform:translate(-70px,-26px) scale(2.4)}}
.ix .lineas line{stroke-dasharray:40 400;animation:ix-viento .9s linear infinite}
@keyframes ix-viento{from{stroke-dashoffset:0}to{stroke-dashoffset:440}}
.ix .gruabrazo{transform-box:view-box;transform-origin:1390px 520px;animation:ix-grua 3.2s ease-in-out 2.5s infinite alternate}
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
.ix .tit h1 span{display:inline-block;opacity:0;transform:translateY(40px) rotateX(70deg);filter:blur(8px);
  background:linear-gradient(90deg,#fff 0%,#bae6fd 30%,#c4b5fd 60%,#fff 90%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:ix-letra .8s cubic-bezier(.22,1,.36,1) forwards,ix-shimmer 2.6s linear 6.2s infinite}
@keyframes ix-letra{to{opacity:1;transform:none;filter:none}}
@keyframes ix-shimmer{to{background-position:-300% 0}}
.ix .tit .sub{display:flex;justify-content:center;gap:clamp(10px,2vw,26px);margin-top:16px;flex-wrap:wrap}
.ix .tit .sub b{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;font-size:clamp(11px,1.3vw,15px);letter-spacing:.18em;text-transform:uppercase;font-weight:750;
  background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 10px 30px -10px rgba(14,165,233,.6);backdrop-filter:blur(10px);
  opacity:0;transform:translateY(16px) scale(.9);animation:ix-chip .7s cubic-bezier(.34,1.56,.64,1) forwards}
.ix .tit .sub b i{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 12px var(--c)}
@keyframes ix-chip{to{opacity:1;transform:none}}
.ix .tit .emp{margin-top:14px;color:#9fb3cf;font-size:clamp(10px,1.1vw,13px);letter-spacing:.32em;text-transform:uppercase;opacity:0;animation:ix-aparece 1s ease 6.6s forwards}
.ix .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(255,255,255,.85),transparent 60%);opacity:0;pointer-events:none;animation:ix-flash 1.1s ease 7.2s forwards}
@keyframes ix-flash{0%{opacity:0}40%{opacity:.85}100%{opacity:0}}
.ix .saltar{position:absolute;right:20px;bottom:18px;display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;font-size:12px;letter-spacing:.06em;
  color:#cbd5e1;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);opacity:0;animation:ix-aparece .6s ease 1.2s forwards}
.ix .prog{position:absolute;left:50%;bottom:0;width:min(320px,60vw);height:3px;transform:translateX(-50%);background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}
.ix .prog i{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#a78bfa,#f472b6);transform-origin:left;animation:ix-prog ${DURACION}ms linear forwards}
@keyframes ix-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.ix *,.ix *::before,.ix *::after{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
`;

const CAMION = `
<g class="camion"><g class="rebote">
  <g class="polvo" fill="#e2e8f0">${[0, 1, 2, 3, 4].map((i) => `<circle cx="-6" cy="${58 - (i % 2) * 6}" r="${6 + i}" style="animation-delay:${i * 0.18}s"/>`).join('')}</g>
  <path d="M0 22 L18 0 H170 L186 22 V58 H0 Z" fill="url(#ix-tolva)"/>
  <path d="M10 14 H176" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
  <path d="M22 0 Q95 -30 168 0 Z" fill="url(#ix-sal)"/>
  <rect x="186" y="34" width="14" height="10" rx="2" fill="#0f172a"/>
  <path d="M198 58 V12 Q198 4 206 4 H240 Q252 4 256 16 L264 36 V58 Z" fill="url(#ix-cab)"/>
  <path d="M214 12 H238 Q246 12 249 20 L254 34 H214 Z" fill="#bae6fd" opacity=".9"/>
  <rect x="256" y="44" width="10" height="6" rx="2" fill="#fde68a"/>
  <path d="M266 47 L420 30 L420 64 Z" fill="url(#ix-faro)" opacity=".55"/>
  ${[40, 72, 150, 236].map((x) => `<g transform="translate(${x} 62)"><g class="rueda"><circle r="13" fill="#0b1220"/><circle r="6.5" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#cbd5e1" stroke-width="2"/></g></g>`).join('')}
</g></g>`;

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
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = 0, h = 0;
  const ajustar = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  ajustar();
  const N = reducido ? 60 : Math.min(260, Math.round((w * h) / 7000));
  const ps = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.3, v: Math.random() * 0.5 + 0.1, f: Math.random() * Math.PI * 2, c: Math.random() < 0.7 ? '255,255,255' : Math.random() < 0.5 ? '125,211,252' : '196,181,253' }));
  let vivo = true; const t0 = performance.now();
  const paso = (t) => {
    if (!vivo) return;
    const e = (t - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      if (!reducido) { p.y -= p.v; p.x += Math.sin(e + p.f) * 0.15; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; } }
      const a = 0.35 + 0.65 * Math.abs(Math.sin(e * 1.6 + p.f));
      ctx.beginPath(); ctx.fillStyle = `rgba(${p.c},${a})`; ctx.shadowBlur = p.r * 6; ctx.shadowColor = `rgba(${p.c},${a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
  window.addEventListener('resize', ajustar);
  return () => { vivo = false; window.removeEventListener('resize', ajustar); };
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
      <div class="tit"><h1>${[...titulo].map((ch, i) => `<span style="animation-delay:${(4.9 + i * 0.045).toFixed(3)}s,6.2s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h1>
        <div class="sub">${[['Despacho', '#38bdf8'], ['Acopio', '#34d399'], ['Embarque', '#a78bfa']].map(([t, c], i) => `<b style="--c:${c};animation-delay:${(5.9 + i * 0.18).toFixed(2)}s"><i></i>${t}</b>`).join('')}</div>
        <div class="emp">Pacífico Despachos · Acopio de sal · Chancay</div></div></div>
    <div class="flash"></div><div class="saltar">Toque para continuar ›</div><div class="prog"><i></i></div>`;
  document.body.appendChild(el);
  const parar = particulas(el.querySelector('canvas'), reducido);
  let fuera = false;
  const cerrar = () => {
    if (fuera) return; fuera = true;
    el.classList.add('fuera');
    document.removeEventListener('keydown', cerrar);
    setTimeout(() => { parar(); el.remove(); st.remove(); }, 1100);
  };
  el.addEventListener('click', cerrar);
  document.addEventListener('keydown', cerrar);
  setTimeout(cerrar, reducido ? 1200 : DURACION);
}
