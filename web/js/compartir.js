// Exportación a HTML y enlaces para compartir (SharePoint) de cualquier pantalla o sección.
// También decora los botones de exportación con íconos representativos (Excel, PDF, HTML, enlace).
import { state, esc, toast, modal, descargarBlob, esNativa, colores } from './core.js?v=__V__';
const aBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
import * as G from './graph.js?v=__V__';

const SVG = (inner, vb = '0 0 24 24') => `<svg class="fx-ico" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
const ICO_WA = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path fill="#fff" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>';
export const ICO = {
  xls: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#16a34a"/><path d="M8 7l8 10M16 7L8 17" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'),
  pdf: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#dc2626"/><text x="12" y="15.6" text-anchor="middle" font-size="7.6" font-weight="800" font-family="Inter,Arial,sans-serif" fill="#fff">PDF</text>'),
  html: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#ea580c"/><path d="M9.5 8.5 6 12l3.5 3.5M14.5 8.5 18 12l-3.5 3.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  link: SVG('<rect x="2" y="2" width="20" height="20" rx="5" fill="#2563eb"/><path d="M10.5 13.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.6.6M13.5 10.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.6-.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};

let cssApp = null;
async function cssTexto() {
  if (cssApp !== null) return cssApp;
  try { cssApp = await (await fetch(document.querySelector('link[href*="css/app.css"]').href)).text(); } catch { cssApp = ''; }
  return cssApp;
}
const ahora = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const opNombre = () => { const o = state.ops.find((x) => x.id === state.opId); return o ? `${o.nave} · Orden ${o.orden}` : ''; };
const archivoSeguro = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ·.]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Genera un HTML autónomo (estilos incluidos, gráficos como imágenes) del elemento indicado. */
/** HTML limpio (sin controles, gráficos como imágenes) de un elemento de la pantalla. */
/** Dibuja cada gráfico con los colores del tema oscuro y del claro y devuelve ambas imágenes.
    Se hace en un solo paso (sin pintar la pantalla entre medio), así no se nota el cambio de tema. */
function graficosEnDosTemas(canvases) {
  const raiz = document.documentElement, antes = raiz.getAttribute('data-theme');
  const res = canvases.map(() => ({}));
  const C = window.Chart, defC = C?.defaults.color, defB = C?.defaults.borderColor;
  const respaldo = new Map(); // gráfico → [[escala, grid, ticks, border]] originales
  try {
    for (const tema of ['dark', 'light']) {
      raiz.setAttribute('data-theme', tema);
      const c = colores();
      if (C) { C.defaults.color = c.texto; C.defaults.borderColor = c.grid; }
      canvases.forEach((cv, i) => {
        const ch = C?.getChart?.(cv);
        if (ch) {
          // cuadrícula, ejes y leyendas con los colores del tema (algunos gráficos los fijan al crearse)
          try {
            const op = ch.config?.options || ch.options;
            op.scales = op.scales || {};
            Object.keys(ch.scales || {}).forEach((id) => { op.scales[id] = op.scales[id] || {}; });
            Object.values(op.scales).forEach((sc) => {
              if (!sc) return;
              (respaldo.get(ch) || respaldo.set(ch, []).get(ch)).push([sc, sc.grid?.color, sc.ticks?.color, sc.border?.color]);
              sc.grid = { ...(sc.grid || {}), color: c.grid }; sc.ticks = { ...(sc.ticks || {}), color: c.texto }; sc.border = { ...(sc.border || {}), color: c.grid };
            });
            op.plugins = op.plugins || {}; op.plugins.legend = op.plugins.legend || {}; op.plugins.legend.labels = { ...(op.plugins.legend.labels || {}), color: c.texto };
            ch.options = op; // reasignar limpia la caché de opciones resueltas de Chart.js
            ch.update('none');
            ch.draw(); // dibuja ya (si no, Chart.js puede dejarlo para el próximo cuadro)
          } catch (e) { console.warn('[compartir] gráfico en tema', tema, e); }
        }
        try { res[i][tema] = cv.toDataURL('image/png'); } catch { /* */ }
      });
    }
  } finally {
    if (antes == null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', antes);
    if (C) { C.defaults.color = defC; C.defaults.borderColor = defB; }
    respaldo.forEach((lista, ch) => {
      // vuelve a los colores originales (el primer respaldo de cada escala es el original)
      const vistas = new Set();
      lista.forEach(([sc, g, t, b]) => { if (vistas.has(sc)) return; vistas.add(sc); sc.grid.color = g; sc.ticks.color = t; sc.border.color = b; });
      const op = ch.config?.options || ch.options;
      if (op.plugins?.legend?.labels) op.plugins.legend.labels.color = undefined;
      try { ch.options = op; } catch { /* */ }
    });
    canvases.forEach((cv) => { try { const ch = C?.getChart?.(cv); ch?.update('none'); ch?.draw(); } catch { /* */ } });
  }
  return res;
}

/** Zonas interactivas de un gráfico (barras, puntos y sectores) con el texto del recuadro de datos,
    para mostrarlo al tocar o pasar el mouse sobre la imagen del gráfico en el archivo compartido. */
function zonasDe(cv) {
  const ch = window.Chart?.getChart?.(cv);
  if (!ch) return null;
  const W = ch.width || cv.clientWidth, H = ch.height || cv.clientHeight;
  if (!W || !H) return null;
  const cb = ch.options?.plugins?.tooltip?.callbacks || {};
  const zonas = [];
  ch.data.datasets.forEach((ds, di) => {
    const meta = ch.getDatasetMeta(di);
    if (meta.hidden || ds.hidden) return;
    (meta.data || []).forEach((el, i) => {
      const raw = ds.data?.[i];
      if (raw == null || (typeof raw === 'number' && !Number.isFinite(raw))) return;
      const ctx = { chart: ch, raw, parsed: meta._parsed?.[i] ?? raw, dataset: ds, datasetIndex: di, dataIndex: i, label: ch.data.labels?.[i] ?? '',
        formattedValue: typeof raw === 'number' ? raw.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(raw?.y ?? raw) };
      let titulo = String(ctx.label ?? ''), linea;
      try { const t = cb.title?.([ctx]); if (t != null && String(t) !== '') titulo = Array.isArray(t) ? t.join(' ') : String(t); } catch { /* */ }
      try { linea = cb.label?.(ctx); } catch { linea = null; }
      if (linea == null || linea === '') linea = `${ds.label ? `${ds.label}: ` : ''}${ctx.formattedValue}`;
      const color = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : (ds.borderColor && ds.type !== 'bar' && ch.config.type === 'line' ? ds.borderColor : ds.backgroundColor);
      const p = el.getProps ? el.getProps(['x', 'y', 'base', 'width', 'height', 'horizontal', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true) : el;
      const z = { t: titulo, l: Array.isArray(linea) ? linea.join(' · ') : String(linea), c: typeof color === 'string' ? color : '#60a5fa' };
      if (p.outerRadius != null && p.startAngle != null) Object.assign(z, { k: 'a', x: p.x / W, y: p.y / H, r0: p.innerRadius / W, r1: p.outerRadius / W, a0: p.startAngle, a1: p.endAngle, ar: W / H });
      else if (p.base != null && p.width != null) {
        const horiz = ch.options.indexAxis === 'y';
        const x0 = horiz ? Math.min(p.base, p.x) : p.x - p.width / 2, x1 = horiz ? Math.max(p.base, p.x) : p.x + p.width / 2;
        const y0 = horiz ? p.y - (p.height || 0) / 2 : Math.min(p.base, p.y), y1 = horiz ? p.y + (p.height || 0) / 2 : Math.max(p.base, p.y);
        Object.assign(z, { k: 'r', x0: x0 / W, x1: x1 / W, y0: y0 / H, y1: Math.max(y1, y0 + 3) / H });
      } else if (p.x != null && p.y != null) Object.assign(z, { k: 'p', x: p.x / W, y: p.y / H });
      else return;
      zonas.push(z);
    });
  });
  return zonas.length ? zonas : null;
}

export function fragmentoDe(el) {
  const copia = el.cloneNode(true);
  // Gráficos → imágenes (una por tema: el archivo compartido permite cambiar entre claro y oscuro)
  const orig = [...el.querySelectorAll('canvas')];
  const imgs = graficosEnDosTemas(orig);
  const zonas = orig.map(zonasDe);
  [...copia.querySelectorAll('canvas')].forEach((c, i) => {
    const par = document.createElement('span');
    par.className = 'g-par';
    if (zonas[i]) par.setAttribute('data-zonas', JSON.stringify(zonas[i]));
    for (const tema of ['dark', 'light']) {
      const img = document.createElement('img');
      img.className = tema === 'dark' ? 'g-osc' : 'g-cla';
      if (imgs[i]?.[tema]) img.src = imgs[i][tema];
      img.style.cssText = 'width:100%;height:100%;object-fit:contain';
      par.appendChild(img);
    }
    c.replaceWith(par);
  });
  // Fuera: formularios de edición (p. ej. parámetros), controles, barras de filtros, filas ocultas por el filtro
  copia.querySelectorAll('form').forEach((f) => { const c = f.closest('.card'); (c && c !== copia ? c : f).remove(); });
  // Títulos que son botones dentro de cabeceras de tabla (p. ej. "1er REPORTE", que abre sus viajes): se conservan como texto
  copia.querySelectorAll('th button, th .btn').forEach((b) => { const s = document.createElement('span'); s.className = 'th-txt'; s.textContent = b.textContent.trim(); b.replaceWith(s); });
  copia.querySelectorAll('.tabs').forEach((x) => x.remove()); // la barra de sub-pestañas: cada una va como pestaña del reporte
  copia.querySelectorAll('button, .btn, .tbar, tr.tfil, .no-print, input[type=file], dialog, [data-fx]').forEach((x) => x.remove());
  copia.querySelectorAll('tr[hidden]').forEach((x) => x.remove());
  // Controles: sólo se muestran los filtros que están aplicados
  const origCtl = [...el.querySelectorAll('input, select, textarea')];
  [...copia.querySelectorAll('input, select, textarea')].forEach((x, i) => {
    const o = origCtl[i] || x;
    const val = o.tagName === 'SELECT' ? (o.value ? o.selectedOptions[0]?.textContent : '') : (o.type === 'checkbox' || o.type === 'radio' || o.type === 'hidden' ? '' : o.value);
    if (!val) { x.remove(); return; }
    const s = document.createElement('span');
    s.className = 'filtro-act'; s.textContent = `Filtro: ${val}`;
    x.replaceWith(s);
  });
  copia.querySelectorAll('.table-wrap').forEach((x) => { x.style.maxHeight = 'none'; });
  copia.classList.remove('sale', 'entra', 'atras');
  return copia.classList.contains('content') ? copia.innerHTML : copia.outerHTML;
}

/* Tablas del archivo compartido: búsqueda, filtros por columna y orden por encabezado (sin la app) */
const SCRIPT_TABLAS = String.raw`(function(){
function num(t){var s=t.replace(/[^0-9,.\-]/g,'');if(!/\d/.test(s))return null;var n=parseFloat(s.replace(/,/g,''));return isNaN(n)?null:n}
function fecha(t){var m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);return m?(+m[3])*1e8+(+m[2])*1e6+(+m[1])*1e4+(m[4]?(+m[4])*100+(+m[5]):0):null}
var esNum=/^[\s\d.,\-%]+$/;
document.querySelectorAll('.table-wrap > table').forEach(function(t){
 if(t.classList.contains('cortes')||t.classList.contains('matriz')||t.classList.contains('info'))return;
 var tb=t.tBodies[0],head=t.tHead&&t.tHead.rows[0];if(!tb||!head)return;
 var filas=[].slice.call(tb.rows);if(filas.length<4)return;
 var ncol=head.cells.length,fv=[];
 var bar=document.createElement('div');bar.className='rf-bar';
 bar.innerHTML='<input type="search" placeholder="Buscar en la tabla…"><button type="button">Filtros por columna</button><span class="rf-n"></span>';
 t.parentNode.parentNode.insertBefore(bar,t.parentNode);
 var q=bar.querySelector('input'),btn=bar.querySelector('button'),cnt=bar.querySelector('.rf-n');
 var fr=document.createElement('tr');fr.className='rf-fil';fr.hidden=true;
 for(var i=0;i<ncol;i++){var th=document.createElement('th'),inp=document.createElement('input');inp.placeholder='Filtrar';inp.setAttribute('data-c',i);th.appendChild(inp);fr.appendChild(th);fv.push('')}
 t.tHead.appendChild(fr);
 function txt(r,i){var c=r.cells[i];return c?c.textContent.trim():''}
 function aplicar(){var s=q.value.trim().toLowerCase(),v=0;filas.forEach(function(r){var ok=!s||r.textContent.toLowerCase().indexOf(s)>=0;for(var i=0;ok&&i<ncol;i++){if(fv[i]&&txt(r,i).toLowerCase().indexOf(fv[i])<0)ok=false}r.style.display=ok?'':'none';if(ok)v++});cnt.textContent=v+' de '+filas.length+' filas'}
 q.addEventListener('input',aplicar);
 fr.addEventListener('input',function(e){var c=e.target.getAttribute('data-c');if(c==null)return;fv[c]=e.target.value.trim().toLowerCase();aplicar()});
 btn.addEventListener('click',function(){fr.hidden=!fr.hidden;btn.className=fr.hidden?'':'on';if(fr.hidden){for(var i=0;i<ncol;i++)fv[i]='';fr.querySelectorAll('input').forEach(function(x){x.value=''});aplicar()}});
 [].forEach.call(head.cells,function(th,i){var dir=0;th.style.cursor='pointer';th.title='Ordenar';th.addEventListener('click',function(){dir=dir===1?-1:1;[].forEach.call(head.cells,function(o){o.removeAttribute('data-ord')});th.setAttribute('data-ord',dir>0?'▲':'▼');
  filas.sort(function(a,b){var x=txt(a,i),y=txt(b,i),fx=fecha(x),fy=fecha(y);if(fx!=null&&fy!=null)return(fx-fy)*dir;var nx=num(x),ny=num(y);if(nx!=null&&ny!=null&&esNum.test(x)&&esNum.test(y))return(nx-ny)*dir;return x.localeCompare(y,'es',{numeric:true})*dir});
  filas.forEach(function(r){tb.appendChild(r)})})});
 aplicar();
});
// Gráficos: recuadro con los datos al tocar o pasar el mouse (como en la app)
var tip=document.createElement('div');tip.className='g-tip';tip.hidden=true;document.body.appendChild(tip);
function zona(par,ev){var z;try{z=JSON.parse(par.getAttribute('data-zonas'))}catch(e){return null}var r=par.getBoundingClientRect();
 var img=[].filter.call(par.querySelectorAll('img'),function(x){return x.offsetParent!==null})[0]||par;var b=img.getBoundingClientRect();
 // la imagen se muestra con object-fit:contain: se calcula el área real del dibujo
 var nw=img.naturalWidth||b.width,nh=img.naturalHeight||b.height,s=Math.min(b.width/nw,b.height/nh),w=nw*s,h=nh*s,ox=b.left+(b.width-w)/2,oy=b.top+(b.height-h)/2;
 var px=(ev.clientX-ox)/w,py=(ev.clientY-oy)/h,mejor=null,dmin=1e9;
 z.forEach(function(q){if(q.k==='r'){if(px>=q.x0-0.004&&px<=q.x1+0.004&&py>=q.y0-0.01&&py<=q.y1+0.01){var d=Math.abs(px-(q.x0+q.x1)/2);if(d<dmin){dmin=d;mejor=q}}}
  else if(q.k==='p'){var d2=Math.hypot((px-q.x)*w,(py-q.y)*h);if(d2<18&&d2<dmin){dmin=d2;mejor=q}}
  else if(q.k==='a'){var dx=(px-q.x)*w,dy=(py-q.y)*h,rr=Math.hypot(dx,dy)/w,an=Math.atan2(dy,dx);
   if(rr>=q.r0&&rr<=q.r1){var a0=q.a0,a1=q.a1;while(an<a0)an+=2*Math.PI;while(an>a0+2*Math.PI)an-=2*Math.PI;if(an<=a1){mejor=q;dmin=0}}}});
 return mejor}
function mostrar(par,ev){var q=zona(par,ev);if(!q){tip.hidden=true;return}
 tip.innerHTML='<b></b><span><i></i></span>';tip.querySelector('b').textContent=q.t;var sp=tip.querySelector('span');sp.appendChild(document.createTextNode(q.l));tip.querySelector('i').style.background=q.c;
 tip.hidden=false;var x=ev.clientX+14,y=ev.clientY+14,tw=tip.offsetWidth,th=tip.offsetHeight;if(x+tw>innerWidth-8)x=ev.clientX-tw-14;if(y+th>innerHeight-8)y=ev.clientY-th-14;tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px'}
document.querySelectorAll('.g-par[data-zonas]').forEach(function(par){par.style.cursor='pointer';
 par.addEventListener('mousemove',function(e){mostrar(par,e)});par.addEventListener('mouseleave',function(){tip.hidden=true});
 par.addEventListener('click',function(e){mostrar(par,e);e.stopPropagation()})});
document.addEventListener('click',function(){tip.hidden=true});window.addEventListener('scroll',function(){tip.hidden=true},true);
// Dentro del visor de la app: toma el tema de la app y quita el botón propio
window.addEventListener('message',function(e){var d=e.data||{};if(d.tema)document.documentElement.setAttribute('data-theme',d.tema);if(d.enApp){var b=document.querySelector('.rep-tema');if(b)b.remove()}});
})();`;

/** Documento HTML autónomo con una o varias secciones (pestañas de la app), con índice para saltar entre ellas. */
export async function documento(titulo, secciones) {
  // Pestaña con sub-pestañas: barra de sub-pestañas como en la app (cambia con enlaces internos, sin scripts)
  const contenido = (x, i) => (x.subs?.length
    ? `<div class="rep-subs"><div class="tabs rep-tabbar" role="tablist">${x.subs.map((s, j) => `<a role="tab" href="#s${i + 1}-${j + 1}">${esc(s.titulo)}</a>`).join('')}</div>
      ${x.subs.map((s, j) => `<div id="s${i + 1}-${j + 1}" class="rep-sub"><div class="content">${s.html}</div></div>`).join('')}</div>`
    : `<div class="content">${x.html}</div>`);
  const tema = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const css = await cssTexto();
  const empresa = 'PACIFICO DESPACHOS S.A.C.';
  const html = `<!doctype html><html lang="es" data-theme="${tema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}${opNombre() ? ` · ${esc(opNombre())}` : ''}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${css}
html,body{overflow-x:auto}body{padding:0;min-width:0}.rep{max-width:none;margin:0;padding:18px 20px}
*,*::before,*::after{animation:none!important;transition:none!important}
.content>*,.card,.kpi,.ficha{opacity:1!important;transform:none!important;filter:none!important}
.table-wrap{max-height:82vh!important;overflow:auto!important}
.filtro-act{display:inline-flex;gap:4px;padding:3px 9px;border-radius:99px;background:var(--primary-soft);color:var(--primary);font-size:12px;font-weight:650;margin-right:6px}
.chart-box img{display:block}.th-txt{font-weight:800;letter-spacing:.02em}.g-par{display:block;width:100%;height:100%}
:root[data-theme=dark] .g-cla,:root:not([data-theme=dark]) .g-osc{display:none!important}
.g-tip{position:fixed;z-index:50;pointer-events:none;display:grid;gap:4px;padding:9px 11px;border-radius:10px;background:rgba(2,6,16,.92);color:#fff;font-size:12.5px;box-shadow:0 10px 30px -8px rgba(0,0,0,.6);max-width:280px}
.g-tip b{font-size:13px}.g-tip span{display:flex;align-items:center;gap:7px}.g-tip i{width:11px;height:11px;border-radius:3px;flex:none;border:1px solid rgba(255,255,255,.6)}
@media print{.g-tip{display:none!important}}
.rf-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px}
.rf-bar input{flex:1 1 200px;min-width:0;padding:7px 11px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:13px}
.rf-bar button{font:inherit;font-size:12.5px;font-weight:650;padding:7px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer}
.rf-bar button.on{background:var(--primary-soft);color:var(--primary);border-color:var(--primary)}
.rf-n{color:var(--muted);font-size:12px;margin-left:auto}
.rf-fil input{width:100%;min-width:64px;padding:4px 7px;font:inherit;font-size:12px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text)}
th[data-ord]::after{content:' ' attr(data-ord);font-size:10px;color:var(--primary)}
/* Tarjetas: el contenido no se sale y en pantallas angostas se reacomodan */
.kpi,.ficha{min-width:0}.kpi *,.ficha *{overflow-wrap:anywhere;min-width:0}
@media(max-width:760px){.fichas.eq>.ficha{flex-basis:calc(50% - 4px)!important}.kpis>.kpi{flex-basis:calc(50% - 6px)!important;min-width:0!important}
.grid.g2,.grid.g3,.grid.g4,.grid.g57,.grid.g12,.grid.g21,.plan4{grid-template-columns:minmax(0,1fr)!important}.rep{padding:12px}}
@media print{.rf-bar,.rf-fil{display:none!important}}
.rep-tema{margin-left:auto;flex:none;font:inherit;font-size:13px;font-weight:650;color:#fff;cursor:pointer;border:0;padding:8px 14px;border-radius:99px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.rep-tema:hover{background:rgba(255,255,255,.28)}
@media print{.rep-tema{display:none}}.rep-h{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px 18px;border-radius:16px;background:var(--grad);color:#fff;box-shadow:var(--shadow-lg)}
.rep-h h1{font-size:20px}.rep-h small{display:block;opacity:.85;font-weight:500}.rep-f{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
.content{padding:0}.content>*,.dbar::before,.bar>i{animation:none!important}
.rep-sec{margin-bottom:26px}.rep-st{font-size:17px;margin:4px 0 12px;padding-left:10px;border-left:4px solid var(--c,var(--primary));display:flex;align-items:center;gap:10px}
/* Varias pestañas: menú lateral; se muestra sólo la pestaña elegida (sin scripts, con :target) */
.rep-cuerpo{display:grid;grid-template-columns:236px minmax(0,1fr);gap:18px;align-items:start}
.rep-lat{position:sticky;top:12px;display:grid;gap:4px;padding:10px;border-radius:16px;background:linear-gradient(180deg,var(--side-2),var(--side));box-shadow:var(--shadow-lg)}
.rep-lat .sep{margin:2px 8px 6px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--side-ink);opacity:.6}
.rep-lat a{display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:11px;color:var(--side-ink);text-decoration:none;font-weight:600;position:relative}
.rep-lat a:hover{background:var(--side-active);color:#fff}
.rep-lat .ico,.rep-st .ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:#fff;background:linear-gradient(145deg,var(--c),color-mix(in srgb,var(--c) 75%,#000));box-shadow:0 4px 10px -3px color-mix(in srgb,var(--c) 70%,transparent)}
.rep-lat .ico svg,.rep-st .ico svg{width:17px;height:17px}
.rep-tabs .rep-sec{display:none}.rep-tabs .rep-sec:target,.rep-tabs .rep-sec:has(:target){display:block}
.rep-tabs:not(:has(:target)) .rep-sec:first-of-type{display:block}
/* Sub-pestañas dentro de una pestaña, como en la app */
.rep-tabbar a{font-weight:650;color:var(--muted);padding:6px 14px;border-radius:9px;text-decoration:none}
.rep-tabbar a:hover{color:var(--text)}
.rep-sub{display:none}.rep-sub:target{display:block}.rep-subs:not(:has(.rep-sub:target)) .rep-tabbar+.rep-sub{display:block}
.rep-subs:not(:has(.rep-sub:target)) .rep-tabbar a:first-child{color:var(--text);background:var(--surface);box-shadow:0 1px 3px rgba(15,27,45,.15),0 0 0 .5px rgba(15,27,45,.06)}
@media(max-width:900px){.rep-cuerpo{grid-template-columns:1fr}.rep-lat{position:static;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}}
@media print{.rep-lat,.rep-tabbar{display:none}.rep-cuerpo{display:block}.rep-tabs .rep-sec,.rep-sub{display:block!important}}
${secciones.length > 1 ? secciones.map((x, i) => `.rep-cuerpo:has(#s${i + 1}:target) .rep-lat a[href="#s${i + 1}"],.rep-cuerpo:has(#s${i + 1} :target) .rep-lat a[href="#s${i + 1}"]${i === 0 ? `,.rep-cuerpo:not(:has(:target)) .rep-lat a[href="#s1"]` : ''}{background:var(--side-active);color:#fff;box-shadow:inset 3px 0 0 var(--c)}`).join('\n') : ''}
${secciones.map((x, i) => (x.subs || []).map((s, j) => `.rep-sec:has(#s${i + 1}-${j + 1}:target) .rep-tabbar a[href="#s${i + 1}-${j + 1}"]{color:var(--text);background:var(--surface);box-shadow:0 1px 3px rgba(15,27,45,.15),0 0 0 .5px rgba(15,27,45,.06)}`).join('\n')).join('\n')}</style></head>
<body><div class="rep"><div class="rep-h"><div><h1>${esc(titulo)}</h1><small>${esc(empresa)}${opNombre() ? ` · ${esc(opNombre())}` : ''} · Generado ${ahora()}</small></div>
<button type="button" class="rep-tema" onclick="var r=document.documentElement,t=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',t);this.textContent=t==='dark'?'☀️ Tema claro':'🌙 Tema oscuro';try{localStorage.setItem('tema-reporte',t)}catch(e){}">${tema === 'dark' ? '☀️ Tema claro' : '🌙 Tema oscuro'}</button></div>
<script>try{var t=localStorage.getItem('tema-reporte');if(t){document.documentElement.setAttribute('data-theme',t);var b=document.querySelector('.rep-tema');if(b)b.textContent=t==='dark'?'☀️ Tema claro':'🌙 Tema oscuro'}}catch(e){}</script>
${secciones.length > 1 ? `<div class="rep-cuerpo">
  <nav class="rep-lat" aria-label="Pestañas compartidas"><div class="sep">Pestañas compartidas</div>${secciones.map((x, i) => `<a href="#s${i + 1}" style="--c:${x.c || '#2563eb'}"><span class="ico">${x.ico || ''}</span><span>${esc(x.titulo)}</span></a>`).join('')}</nav>
  <div class="rep-tabs">${secciones.map((x, i) => `<section id="s${i + 1}" class="rep-sec" style="--c:${x.c || '#2563eb'}"><h2 class="rep-st"><span class="ico">${x.ico || ''}</span>${esc(x.titulo)}</h2>${contenido(x, i)}</section>`).join('')}</div>
</div>` : secciones.map((x, i) => `<section id="s${i + 1}" class="rep-sec">${contenido(x, i)}</section>`).join('')}
<div class="rep-f">Control de Unidades · Despacho · Acopio · Embarque — reporte de solo lectura</div></div>
<script>${SCRIPT_TABLAS}</script></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export async function htmlDe(el, titulo) { return documento(titulo, [{ titulo, html: fragmentoDe(el) }]); }

const nombreArchivo = (titulo) => archivoSeguro(`${titulo}${opNombre() ? ` - ${opNombre().replace(' · ', ' - ')}` : ''}`) || 'reporte';

export async function descargarHTML(el, titulo) {
  try { descargarBlob(await htmlDe(el, titulo), `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
}

/** Comparte un reporte de dos formas:
    - Enlace (usuarios de la organización): se guarda en SharePoint y se abre en la app con la cuenta Microsoft.
    - Archivo (invitados sin cuenta Microsoft): se envía el HTML del reporte, que se abre en cualquier navegador. */
export async function compartir(el, titulo) { return compartirBlob(() => htmlDe(el, titulo), titulo); }
export async function compartirBlob(generar, titulo) {
  const soloArchivo = state.user?.rol === 'transportista';
  let blob;
  try { blob = await generar(); } catch (e) { toast(`No se pudo generar el reporte: ${e.message}`, true); return; }
  const nombre = `${nombreArchivo(titulo)}.html`;
  const kb = Math.max(1, Math.round(blob.size / 1024));
  const tam = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  const asunto = `${titulo}${opNombre() ? ` · ${opNombre()}` : ''}`;
  let url = null, urlSp = null, enlaceListo = null;
  const dlg = modal({
    title: 'Compartir reporte', submitText: 'Enviar por correo', wide: true,
    body: `<label class="fx-inv"><input type="checkbox" name="invitado" ${soloArchivo ? 'checked disabled' : ''}>
        <span><strong>Invitado (sin cuenta Microsoft)</strong><small>Se envía el reporte como archivo: se abre en cualquier celular o PC sin iniciar sesión.</small></span></label>
      <div data-modo="enlace">
        <p style="margin-top:0">El <strong>enlace</strong> abre <strong>${esc(titulo)}</strong> en la aplicación, en <strong>solo lectura</strong>. Quien lo reciba ingresa con su cuenta de Microsoft 365 de la organización;
          si no es usuario de la app, <strong>sólo verá las pestañas de este reporte</strong>. <span class="muted small" id="fx-sp"></span></p>
        <div class="btns" style="flex-wrap:wrap"><input id="fx-url" readonly value="Generando el enlace…" style="flex:1 1 260px;min-width:0"><button type="button" class="btn" id="fx-copiar" disabled>Copiar enlace</button>
          <a class="btn" id="fx-abrir" href="#" target="_blank" rel="noopener" aria-disabled="true">Abrir</a>
          <a class="btn fx-wa" id="fx-wa" href="#" target="_blank" rel="noopener" title="Enviar el enlace por WhatsApp">${ICO_WA}WhatsApp</a></div>
      </div>
      <div data-modo="archivo" hidden>
        <p style="margin-top:0">Se enviará el <strong>archivo</strong> <em>${esc(nombre)}</em> (${tam}). Se abre en cualquier navegador <strong>sin iniciar sesión</strong>, con sus pestañas.
          <span class="muted small">Es una copia del momento: no se actualiza. Compártalo sólo con quien deba verlo (el archivo se puede reenviar).</span></p>
        <div class="btns" style="flex-wrap:wrap"><button type="button" class="btn fx-wa" id="fx-wa-arch">${ICO_WA}Enviar por WhatsApp</button>
          <button type="button" class="btn" id="fx-desc">Descargar archivo</button></div>
      </div>
      <div class="form" style="margin-top:14px">
        <label class="full">Para (correos separados por coma)<input name="para" placeholder="usuario@empresa.com, otro@empresa.com">
          <small class="muted">Se envía desde su cuenta de Outlook: <strong>${esc(state.user?.email || '')}</strong></small></label>
        <label class="full">Asunto<input name="asunto" value="${esc(asunto)}" maxlength="250" required></label>
        <label class="full">Mensaje (opcional)<textarea name="mensaje" rows="3">Comparto el reporte "${esc(asunto)}".</textarea></label>
      </div>`,
    onSubmit: async (f) => {
      const para = String(f.para || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
      if (!para.length) throw new Error('Ingrese al menos un correo');
      const tema = String(f.asunto || '').trim() || asunto;
      const archivo = modoArchivo();
      if (!archivo) { await enlaceListo; if (!url) throw new Error('El enlace no está disponible: active "Invitado" para enviar el archivo.'); }
      const pie = `<p style="color:#5b6b80;font-size:12px">${esc(tema)} · Control de Unidades · ${esc(state.user?.nombre || '')}</p>`;
      const cuerpo = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#17212f"><p>${esc(f.mensaje || '').replace(/\n/g, '<br>')}</p>
        ${archivo ? `<p>Se adjunta el reporte <strong>${esc(nombre)}</strong>: ábralo con su navegador (Chrome, Edge, Safari…). No requiere iniciar sesión.</p>`
          : `<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Ver reporte</a></p>`}${pie}</div>`;
      try {
        if (archivo && blob.size > 2.8 * 1024 * 1024) throw new Error(`el archivo pesa ${tam} (máximo 2.8 MB por correo); envíelo por WhatsApp o descárguelo`);
        await G.asegurarPermisoCorreo();
        await G.enviarCorreo({ para, asunto: tema, html: cuerpo, adjuntos: archivo ? [{ nombre, tipo: 'text/html', base64: await aBase64(blob) }] : [] });
        toast(archivo ? `Reporte enviado como archivo a ${para.join(', ')}` : `Enlace enviado a ${para.join(', ')}`);
      } catch (e) {
        if (archivo) descargarBlob(blob, nombre);
        G.abrirCorreo(`mailto:${para.join(',')}?subject=${encodeURIComponent(tema)}&body=${encodeURIComponent(`${f.mensaje || ''}\n\n${archivo ? `(Adjunte el archivo descargado: ${nombre})` : url}`)}`);
        toast(`Se abrió su programa de correo (${e.message})`, true);
      }
    },
  });
  const chk = dlg.querySelector('[name=invitado]');
  const modoArchivo = () => chk.checked;
  const pintarModo = () => {
    dlg.querySelector('[data-modo=enlace]').hidden = modoArchivo();
    dlg.querySelector('[data-modo=archivo]').hidden = !modoArchivo();
    const msj = dlg.querySelector('[name=mensaje]');
    if (/^Comparto el reporte /.test(msj.value)) msj.value = `Comparto el reporte "${asunto}"${modoArchivo() ? ' (archivo adjunto; se abre sin iniciar sesión)' : ''}.`;
  };
  chk.addEventListener('change', pintarModo); pintarModo();
  const tema = () => dlg.querySelector('[name=asunto]')?.value.trim() || asunto;
  const mensaje = () => dlg.querySelector('[name=mensaje]')?.value.trim() || '';

  // ----- Enlace (usuarios con cuenta Microsoft): se genera en segundo plano; no hace falta si sólo se envía el archivo
  const wa = dlg.querySelector('#fx-wa');
  const actualizarWa = () => { wa.href = url ? `https://wa.me/?text=${encodeURIComponent(`*${tema()}*${mensaje() ? `\n${mensaje()}` : ''}\n\n${url}`)}` : '#'; };
  dlg.addEventListener('input', actualizarWa);
  wa.addEventListener('click', (e) => { if (!url) { e.preventDefault(); return; } actualizarWa(); if (window.Capacitor?.isNativePlatform?.()) { e.preventDefault(); location.href = wa.href; } });
  if (!soloArchivo) {
    enlaceListo = (async () => {
      try {
        const d = new Date(); const p = (n) => String(n).padStart(2, '0');
        const ruta = `Compartidos/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())} ${nombre}`;
        await G.subirArchivo(ruta, blob, 'text/html');
        // El enlace abre el reporte dentro de la app (SharePoint no muestra páginas HTML; sólo las descarga)
        try { urlSp = await G.crearEnlace(ruta); } catch { urlSp = null; }
        url = urlSp && /^https?:/.test(urlSp) ? `${G.appUrl()}#/ver?s=${G.tokenCompartido(urlSp)}` : `${G.appUrl()}#/ver?f=${encodeURIComponent(ruta)}`;
        dlg.querySelector('#fx-url').value = url;
        dlg.querySelector('#fx-copiar').disabled = false;
        const ab = dlg.querySelector('#fx-abrir'); ab.href = url; ab.removeAttribute('aria-disabled');
        if (urlSp) dlg.querySelector('#fx-sp').innerHTML = `Guardado en SharePoint (<em>Control Unidades Sal/Compartidos</em>): <a href="${esc(urlSp)}" target="_blank" rel="noopener">abrir archivo</a>.`;
        actualizarWa();
      } catch (e) {
        dlg.querySelector('#fx-url').value = `No se pudo crear el enlace (${e.message}). Active "Invitado" para enviar el archivo.`;
      }
    })();
  }

  // ----- Archivo (invitados): menú Compartir del sistema con el archivo adjunto (WhatsApp, Telegram, Gmail…)
  dlg.querySelector('#fx-desc').addEventListener('click', () => descargarBlob(blob, nombre));
  dlg.querySelector('#fx-wa-arch').addEventListener('click', async () => {
    const texto = `*${tema()}*${mensaje() ? `\n${mensaje()}` : ''}`;
    if (esNativa()) { descargarBlob(blob, nombre); return; } // app Android: abre el menú Compartir con el archivo
    const file = new File([blob], nombre, { type: 'text/html' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: tema(), text: texto }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    // Sin "Compartir" con archivos (p. ej. algunos navegadores de PC): se descarga y se abre WhatsApp para adjuntarlo
    descargarBlob(blob, nombre);
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n\n(Adjunto el archivo del reporte: ${nombre})`)}`, '_blank', 'noopener');
    toast('Se descargó el archivo: adjúntelo en el chat de WhatsApp (📎 › Documento).');
  });

  dlg.querySelector('#fx-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { dlg.querySelector('#fx-url').select(); document.execCommand('copy'); toast('Enlace copiado'); }
  });
}

/* ---------- Decoración automática de los botones de exportación ---------- */
const tituloDe = (scope) => scope.querySelector('h2, h3')?.textContent.trim() || document.querySelector('#titulo')?.textContent.trim() || 'Reporte';
function decorar(b) {
  b.dataset.fxd = '1';
  const t = b.textContent.trim();
  const tipo = /\bExcel\b|\bXLSX?\b/i.test(t) ? 'xls' : /\bPDF\b/.test(t) ? 'pdf' : null;
  if (!tipo) return;
  b.classList.add('fx', `fx-${tipo}`);
  b.insertAdjacentHTML('afterbegin', ICO[tipo]);
  b.title = b.title || `Descargar en ${tipo === 'xls' ? 'Excel' : 'PDF'}`;
  // Junto a cada PDF: HTML y enlace para compartir (de la sección donde está el botón)
  if (tipo === 'pdf' && !b.closest('dialog, td, .fx-sin-html') && !b.parentElement.querySelector('[data-fx]')) {
    const scope = () => { const c = b.closest('.card'); return c && c.querySelector('table, canvas, .kpi, .fichas, .vlista') ? c : document.getElementById('view'); };
    const h = document.createElement('button');
    h.type = 'button'; h.className = `btn fx fx-html${b.classList.contains('sm') ? ' sm' : ''}`; h.dataset.fx = 'html';
    h.innerHTML = `${ICO.html}HTML`; h.title = 'Descargar como página HTML';
    h.addEventListener('click', () => descargarHTML(scope(), tituloDe(scope())));
    const l = document.createElement('button');
    l.type = 'button'; l.className = `btn fx fx-link${b.classList.contains('sm') ? ' sm' : ''}`; l.dataset.fx = 'link';
    l.innerHTML = `${ICO.link}Compartir`; l.title = 'Crear un enlace para compartir por correo';
    l.addEventListener('click', () => compartir(scope(), tituloDe(scope())));
    b.after(h, l);
    if (state.user?.rol === 'transportista') l.remove();
  }
}
export function activarExportes(root = document.body) {
  const scan = () => root.querySelectorAll('.btn:not([data-fxd]):not([data-fx])').forEach(decorar);
  scan();
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; scan(); }); }).observe(root, { childList: true, subtree: true });
}

/** Pantalla "Reporte compartido": muestra dentro de la app el HTML guardado en SharePoint. */
export async function vVer(view) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const f = qs.get('f'), sh = qs.get('s');
  let texto, webUrl, archivo;
  if (sh && /^u![\w-]+$/.test(sh)) ({ texto, webUrl, nombre: archivo } = await G.leerCompartido(sh));
  else if (f && /^Compartidos\/[^/]+\.html$/.test(f) && state.user?.rol !== 'invitado') { ({ texto, webUrl } = await G.leerTexto(f)); archivo = f.split('/').pop(); }
  else { view.innerHTML = '<div class="alert bad">Enlace de reporte no válido.</div>'; return; }
  const nombre = String(archivo || 'Reporte').replace(/^\d{8}-\d{6}\s*/, '').replace(/\.html$/, '');
  view.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div class="card-h" style="padding:12px 16px;margin:0;border-bottom:1px solid var(--border)">
      <div><h2>${esc(nombre)}</h2><div class="muted small">Reporte compartido · solo lectura</div></div>
      <div class="btns"><button class="btn sm fx" id="v-desc" data-fx="html">${ICO.html}Descargar HTML</button>
      <button class="btn sm" id="v-nueva">Abrir en otra pestaña</button>${webUrl && state.user?.rol !== 'invitado' ? `<a class="btn sm" href="${esc(webUrl)}" target="_blank" rel="noopener">SharePoint</a>` : ''}</div></div>
    <iframe id="v-frame" title="${esc(nombre)}" sandbox="allow-scripts allow-popups" style="display:block;width:100%;height:calc(100vh - 150px);border:0;background:var(--bg)"></iframe></div>`;
  const blob = () => new Blob([texto], { type: 'text/html;charset=utf-8' });
  // Como documento propio (blob) para que el menú lateral del reporte cambie de pestaña dentro del visor
  const u = URL.createObjectURL(blob());
  const fr = view.querySelector('#v-frame');
  // El reporte corre aislado (sin acceso a la sesión de la app); el tema se le envía por mensaje
  fr.addEventListener('load', () => { try { fr.contentWindow.postMessage({ enApp: true, tema: document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') }, '*'); } catch { /* */ } });
  fr.src = u;
  window.addEventListener('hashchange', () => URL.revokeObjectURL(u), { once: true });
  view.querySelector('#v-desc').onclick = () => descargarBlob(blob(), `${nombre}.html`);
  view.querySelector('#v-nueva').onclick = () => { const u = URL.createObjectURL(blob()); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); };
}

/**
 * Selector de pestañas para exportar o compartir varias a la vez.
 * rutas: [{ k, t }], actual: clave de la pantalla abierta, capturar(keys) → [{ titulo, html }]
 */
export function elegirPantallas({ rutas, actual, capturar, accion = 'compartir' }) {
  const dlg = modal({
    title: accion === 'compartir' ? 'Compartir reporte' : 'Descargar reporte HTML', wide: true,
    submitText: accion === 'compartir' ? 'Crear enlace' : 'Descargar HTML',
    body: `<p class="muted" style="margin-top:0">Elija las pestañas que se incluirán. Se genera un solo reporte con un índice para pasar de una a otra${opNombre() ? `, con los datos de <strong>${esc(opNombre())}</strong>` : ''}.</p>
      <div class="btns" style="margin-bottom:10px"><button type="button" class="btn sm" data-todas>Seleccionar todas</button><button type="button" class="btn sm" data-ninguna>Quitar todas</button></div>
      <div class="pant-sel">${rutas.map((r) => `<label class="pant"><input type="checkbox" name="r:${r.k}" ${r.k === actual ? 'checked' : ''}>
        <span class="ico" style="--c:${r.c || '#2563eb'}">${r.ico || ''}</span><span>${esc(r.t)}</span></label>`).join('')}</div>`,
    onSubmit: async (f) => {
      const keys = rutas.map((r) => r.k).filter((k) => f[`r:${k}`]);
      if (!keys.length) throw new Error('Seleccione al menos una pestaña');
      const titulo = keys.length === 1 ? rutas.find((r) => r.k === keys[0]).t : 'Reporte de la operación';
      const generar = async () => documento(titulo, await capturar(keys));
      if (accion === 'compartir') setTimeout(() => compartirBlob(generar, titulo), 0);
      else {
        try { const blob = await generar(); descargarBlob(blob, `${nombreArchivo(titulo)}.html`); toast('Reporte HTML generado'); } catch (e) { toast(e.message, true); }
      }
    },
  });
  dlg.querySelector('[data-todas]').onclick = () => dlg.querySelectorAll('.pant input').forEach((x) => { x.checked = true; });
  dlg.querySelector('[data-ninguna]').onclick = () => dlg.querySelectorAll('.pant input').forEach((x) => { x.checked = false; });
}
