// Presentación de entrada: escena animada (camión con sal llegando al puerto) antes de ingresar.
// Se muestra una vez por sesión del navegador; un clic o una tecla la saltan.
const SVG = `
<svg viewBox="0 0 800 450" aria-hidden="true">
  <defs>
    <linearGradient id="ig-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset=".55" stop-color="#0ea5e9"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>
    <radialGradient id="ig-halo"><stop offset="0" stop-color="#38bdf8" stop-opacity=".55"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
    <linearGradient id="ig-sal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fbff"/><stop offset="1" stop-color="#93c5fd"/></linearGradient>
    <linearGradient id="ig-cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
    <linearGradient id="ig-tolva" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/></linearGradient>
    <linearGradient id="ig-suelo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38bdf8" stop-opacity="0"/><stop offset=".5" stop-color="#38bdf8" stop-opacity=".55"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>
  </defs>
  <circle class="halo" cx="400" cy="112" r="120" fill="url(#ig-halo)"/>
  <g class="logo">
    <rect x="352" y="64" width="96" height="96" rx="26" fill="url(#ig-logo)"/>
    <rect x="352" y="64" width="96" height="96" rx="26" fill="none" stroke="rgba(255,255,255,.35)"/>
    <g transform="translate(372 84) scale(2.33)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 17h11V7H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
    </g>
  </g>
  <!-- pilas de sal en el puerto -->
  <path d="M560 330 L640 240 L720 330 Z" fill="url(#ig-sal)" opacity=".95"/>
  <path d="M640 330 L700 262 L770 330 Z" fill="url(#ig-sal)" opacity=".75"/>
  <path d="M600 330 L640 240 L660 262" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
  <!-- grúa del puerto -->
  <g stroke="#7dd3fc" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round">
    <path d="M745 330 V200 M745 205 H660 M745 225 L700 205 M690 205 v30"/>
  </g>
  <!-- pista -->
  <rect x="40" y="331" width="720" height="2" fill="url(#ig-suelo)"/>
  <line class="pista" x1="40" y1="348" x2="760" y2="348" stroke="#38bdf8" stroke-opacity=".35" stroke-width="3"/>
  <!-- camión tolva -->
  <g class="camion">
    <g transform="translate(250 252)">
      <path d="M0 22 L18 0 H170 L186 22 V58 H0 Z" fill="url(#ig-tolva)"/>
      <path d="M10 14 H176" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
      <path d="M22 0 Q95 -26 168 0 Z" fill="url(#ig-sal)"/>
      <circle class="grano" cx="70" cy="-6" r="3" fill="#e0f2fe" style="animation-delay:.2s"/>
      <circle class="grano" cx="100" cy="-10" r="2.4" fill="#e0f2fe" style="animation-delay:.6s"/>
      <circle class="grano" cx="130" cy="-6" r="2.8" fill="#e0f2fe" style="animation-delay:1s"/>
      <rect x="186" y="34" width="14" height="10" rx="2" fill="#1e293b"/>
      <path d="M198 58 V12 Q198 4 206 4 H240 Q252 4 256 16 L264 36 V58 Z" fill="url(#ig-cab)"/>
      <path d="M214 12 H238 Q246 12 249 20 L254 34 H214 Z" fill="#bae6fd" opacity=".85"/>
      <rect x="256" y="44" width="10" height="6" rx="2" fill="#fde68a"/>
      <g transform="translate(40 62)"><g class="rueda"><circle r="13" fill="#0f172a"/><circle r="6" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#94a3b8" stroke-width="2"/></g></g>
      <g transform="translate(72 62)"><g class="rueda"><circle r="13" fill="#0f172a"/><circle r="6" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#94a3b8" stroke-width="2"/></g></g>
      <g transform="translate(150 62)"><g class="rueda"><circle r="13" fill="#0f172a"/><circle r="6" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#94a3b8" stroke-width="2"/></g></g>
      <g transform="translate(236 62)"><g class="rueda"><circle r="13" fill="#0f172a"/><circle r="6" fill="#64748b"/><path d="M-9 0 H9 M0 -9 V9" stroke="#94a3b8" stroke-width="2"/></g></g>
    </g>
  </g>
</svg>`;

export function mostrarIntro() {
  try { if (sessionStorage.getItem('intro-vista')) return; sessionStorage.setItem('intro-vista', '1'); } catch { /* sin storage */ }
  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="esc">${SVG}<div class="tit"><h1>Control de Unidades</h1><p>Despacho · Acopio · Embarque de sal</p></div></div>
    <div class="saltar">Toque para continuar</div><div class="prog"><i></i></div>`;
  document.body.appendChild(el);
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let fuera = false;
  const cerrar = () => {
    if (fuera) return; fuera = true;
    el.classList.add('fuera');
    document.removeEventListener('keydown', cerrar);
    setTimeout(() => el.remove(), 650);
  };
  el.addEventListener('click', cerrar);
  document.addEventListener('keydown', cerrar);
  setTimeout(cerrar, reducido ? 900 : 3400);
}
