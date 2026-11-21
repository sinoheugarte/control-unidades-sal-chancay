// Inicio de sesión con Microsoft 365 (OAuth2 + PKCE) y almacenamiento en SharePoint vía Microsoft Graph.
// Usa el mismo registro de aplicación de Entra ID y el mismo sitio de SharePoint que "Pacifico TP Reporte".

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULTS = {
  cid: '68f959e1-a921-41ef-bf24-0c6186f7762c',
  tid: '0a2f1182-59f9-43e2-9d37-a84a14b82f04',
  spSite: 'https://quimpaccorp.sharepoint.com/sites/PacificoTP',
  carpeta: 'Control Unidades Sal',
};
const SCOPES = ['https://graph.microsoft.com/User.Read', 'https://graph.microsoft.com/Files.ReadWrite', 'https://graph.microsoft.com/Sites.ReadWrite.All'];
const CFG_KEY = 'cus_cfg';
const TOKEN_KEY = 'cus_token';
const PKCE_KEY = 'cus_pkce';

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

/** URL de retorno: la propia página (sin query ni hash). */
export const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

export function getCfg() {
  const s = ls.get(CFG_KEY) || {};
  return { cid: s.cid || DEFAULTS.cid, tid: s.tid || DEFAULTS.tid, spSite: s.spSite || DEFAULTS.spSite, carpeta: s.carpeta || DEFAULTS.carpeta };
}
export function setCfg(c) { ls.set(CFG_KEY, c); ls.del(TOKEN_KEY); driveId = null; }

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function canjear(params, scopes = null) {
  const cfg = getCfg();
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tid}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.cid, scope: `${scopes || SCOPES.join(' ')} offline_access`, ...params }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error_description || d.error);
  ls.set(TOKEN_KEY, { access: d.access_token, refresh: d.refresh_token || ls.get(TOKEN_KEY)?.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000,
    scopes: scopes || ls.get(TOKEN_KEY)?.scopes || null });
}

/** ¿Esta ventana es el popup que vuelve del login de Microsoft? */
export const esRetornoLogin = () => !!window.opener && /[?&](code|error)=/.test(location.search);

/** Inicia sesión en una ventana emergente (igual que la app TP). */
export async function login(extra = []) {
  const cfg = getCfg();
  const scopes = [...SCOPES, ...extra.map((s) => `https://graph.microsoft.com/${s}`)].join(' ');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const redir = appUrl();
  const u = new URL(`https://login.microsoftonline.com/${cfg.tid}/oauth2/v2.0/authorize`);
  Object.entries({
    client_id: cfg.cid, response_type: 'code', redirect_uri: redir, scope: `${scopes} offline_access`,
    code_challenge: challenge, code_challenge_method: 'S256', state, response_mode: 'query', prompt: 'select_account',
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const W = 500, H = 640;
  const popup = window.open(u.toString(), 'msAuth', `width=${W},height=${H},left=${(screen.width - W) / 2},top=${(screen.height - H) / 2}`);
  if (!popup && extra.length) throw new Error('El navegador bloqueó la ventana de Microsoft. Permita ventanas emergentes para este sitio e intente de nuevo.');
  if (!popup) {
    // Sin ventanas emergentes (p. ej. algunos celulares): flujo por redirección
    ls.set(`${PKCE_KEY}_redir`, { verifier, state });
    location.href = u.toString();
    return new Promise(() => {});
  }
  const href = await new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (popup.closed) { clearInterval(t); reject(new Error('Se canceló el inicio de sesión')); return; }
      try {
        if (popup.location.href.startsWith(redir) && /[?&](code|error)=/.test(popup.location.search)) {
          const h = popup.location.href; clearInterval(t); popup.close(); resolve(h);
        }
      } catch { /* todavía en login.microsoftonline.com */ }
    }, 300);
  });
  const url = new URL(href);
  if (url.searchParams.get('error')) throw new Error(mensajeError(url.searchParams.get('error_description') || url.searchParams.get('error')));
  if (url.searchParams.get('state') !== state) throw new Error('Respuesta de inicio de sesión inválida (state)');
  sessionStorage.removeItem(PKCE_KEY);
  try { await canjear({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redir, code_verifier: verifier }, scopes); } catch (e) { throw new Error(mensajeError(e.message)); }
}

/** Completa el flujo por redirección (cuando no hubo popup). Devuelve true si procesó un código. */
export async function completarRedireccion() {
  const p = new URLSearchParams(location.search);
  const saved = ls.get(`${PKCE_KEY}_redir`);
  if (!saved || (!p.get('code') && !p.get('error'))) return false;
  ls.del(`${PKCE_KEY}_redir`);
  history.replaceState({}, '', location.pathname + location.hash);
  if (p.get('error')) throw new Error(mensajeError(p.get('error_description') || p.get('error')));
  if (p.get('state') !== saved.state) throw new Error('Respuesta de inicio de sesión inválida (state)');
  await canjear({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: appUrl(), code_verifier: saved.verifier });
  return true;
}

function mensajeError(m) {
  if (/AADSTS50011/.test(m)) return `La dirección ${appUrl()} no está registrada como "Redirect URI" en la app de Entra ID (Azure). Agréguela como plataforma "Aplicación de página única (SPA)".`;
  if (/AADSTS65001|consent/i.test(m)) return 'Falta el consentimiento de permisos en Entra ID. Pida al administrador de Microsoft 365 que lo otorgue.';
  return m;
}

export const haySesion = () => !!ls.get(TOKEN_KEY)?.refresh || (ls.get(TOKEN_KEY)?.exp || 0) > Date.now();

async function token() {
  const t = ls.get(TOKEN_KEY);
  if (!t) throw Object.assign(new Error('Sesión no iniciada'), { status: 401 });
  if (t.exp - Date.now() > 5 * 60e3) return t.access;
  if (!t.refresh) throw Object.assign(new Error('Sesión expirada'), { status: 401 });
  try { await canjear({ grant_type: 'refresh_token', refresh_token: t.refresh }, t.scopes || null); } catch { ls.del(TOKEN_KEY); throw Object.assign(new Error('Sesión expirada, vuelva a ingresar'), { status: 401 }); }
  return ls.get(TOKEN_KEY).access;
}

export function logout() {
  ls.del(TOKEN_KEY);
  driveId = null;
}

async function g(path, { method = 'GET', headers = {}, body, raw = false } = {}) {
  const r = await fetch(path.startsWith('http') ? path : `${GRAPH}/${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, ...headers }, body });
  if (r.status === 401) { ls.del(TOKEN_KEY); throw Object.assign(new Error('Sesión expirada, vuelva a ingresar'), { status: 401 }); }
  if (raw) return r;
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const e = await r.json(); msg = e.error?.message || msg; } catch { /* */ }
    throw Object.assign(new Error(`Microsoft Graph: ${msg}`), { status: r.status });
  }
  return r.status === 204 ? null : r.json();
}

export async function yo() {
  const me = await g('me?$select=displayName,mail,userPrincipalName');
  return { nombre: me.displayName, email: (me.mail || me.userPrincipalName || '').toLowerCase() };
}

/* ------------- archivos JSON en la biblioteca de documentos del sitio ------------- */
let driveId = null;
async function drive() {
  if (driveId) return driveId;
  const u = new URL(getCfg().spSite);
  const site = await g(`sites/${u.hostname}:${u.pathname.replace(/\/$/, '')}?$select=id`);
  driveId = (await g(`sites/${site.id}/drive?$select=id`)).id;
  return driveId;
}
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const rutaItem = async (nombre) => `drives/${await drive()}/root:/${enc(`${getCfg().carpeta}/${nombre}`)}`;

/** Lee un JSON. Devuelve { data, etag } o { data: null, etag: null } si no existe. */
export async function leerJSON(nombre) {
  const ruta = await rutaItem(nombre);
  const r = await g(ruta, { raw: true });
  if (r.status === 404) return { data: null, etag: null };
  if (!r.ok) throw Object.assign(new Error(`No se pudo leer ${nombre} en SharePoint (${r.status})`), { status: r.status });
  const meta = await r.json();
  if (meta.folder) throw new Error(`"${nombre}" es una carpeta en SharePoint, no un archivo`);
  const url = meta['@microsoft.graph.downloadUrl'];
  // Con URL de descarga pre-autenticada (lo normal); si no viene, se descarga por Graph.
  const d = url
    ? await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())
    : await g(`${ruta}:/content`, { raw: true });
  if (!d.ok) throw new Error(`No se pudo descargar ${nombre} (${d.status})`);
  const texto = await d.text();
  let data;
  try { data = texto.trim() ? JSON.parse(texto) : null; } catch { throw new Error(`El archivo ${nombre} en SharePoint está dañado (no es JSON válido)`); }
  return { data, etag: meta.eTag };
}

/** Guarda un JSON. Con etag, falla con status 412 si otro usuario lo modificó antes. */
export async function guardarJSON(nombre, data, etag) {
  const headers = { 'Content-Type': 'application/json' };
  if (etag) headers['If-Match'] = etag;
  const qs = etag ? '' : '?@microsoft.graph.conflictBehavior=replace';
  const r = await g(`${await rutaItem(nombre)}:/content${qs}`, { method: 'PUT', headers, body: JSON.stringify(data), raw: true });
  if (r.status === 412 || r.status === 409) throw Object.assign(new Error('Conflicto de edición'), { status: 412 });
  if (!r.ok) {
    let msg = `${r.status}`; try { msg = (await r.json()).error?.message || msg; } catch { /* */ }
    throw Object.assign(new Error(`No se pudo guardar en SharePoint: ${msg}`), { status: r.status });
  }
  return (await r.json()).eTag;
}

/** Renombra un archivo de la carpeta. Falla con status 409 si ya existe uno con el nombre nuevo. */
export async function renombrarArchivo(nombre, nuevo) {
  const r = await g(await rutaItem(nombre), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nuevo, '@microsoft.graph.conflictBehavior': 'fail' }), raw: true,
  });
  if (r.status === 409) throw Object.assign(new Error(`Ya existe un archivo llamado "${nuevo}" en SharePoint`), { status: 409 });
  if (!r.ok) throw Object.assign(new Error(`No se pudo renombrar ${nombre} (${r.status})`), { status: r.status });
}

/* ---------------- permisos de carpetas (portal de transportistas) ---------------- */

/** Crea la carpeta (dentro de la carpeta de la app) si no existe y devuelve su id. */
export async function asegurarCarpeta(ruta) {
  const r = await g(await rutaItem(ruta), { raw: true });
  if (r.ok) return (await r.json()).id;
  if (r.status !== 404) throw new Error(`No se pudo acceder a la carpeta ${ruta} (${r.status})`);
  const partes = ruta.split('/');
  const nombre = partes.pop();
  const padre = partes.length ? await asegurarCarpeta(partes.join('/')) : (await g(`${(await rutaItem('')).replace(/\/$/, '')}?$select=id`)).id;
  const c = await g(`drives/${await drive()}/items/${padre}/children`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
  });
  return c.id;
}

/** Da permiso de sólo lectura sobre la carpeta a un correo (envía la invitación de SharePoint). */
export async function compartirCarpeta(ruta, email, mensaje, { rol = 'read', invitar = true } = {}) {
  const id = await asegurarCarpeta(ruta);
  await g(`drives/${await drive()}/items/${id}/invite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [{ email }], roles: [rol], requireSignIn: true, sendInvitation: invitar, ...(invitar ? { message: mensaje } : {}) }),
  });
}

/** Quita todos los permisos que la carpeta tenga otorgados a ese correo. */
export async function dejarDeCompartir(ruta, email) {
  const r = await g(await rutaItem(ruta), { raw: true });
  if (r.status === 404) return 0;
  const id = (await r.json()).id;
  const perms = (await g(`drives/${await drive()}/items/${id}/permissions`)).value || [];
  const mail = email.toLowerCase();
  const suyos = perms.filter((p) => !p.inheritedFrom && [p.grantedToV2?.user?.email, p.grantedTo?.user?.email, p.invitation?.email,
    ...(p.grantedToIdentitiesV2 || []).map((x) => x.user?.email), ...(p.grantedToIdentities || []).map((x) => x.user?.email)]
    .some((e) => String(e || '').toLowerCase() === mail));
  for (const p of suyos) await g(`drives/${await drive()}/items/${id}/permissions/${p.id}`, { method: 'DELETE', raw: true });
  return suyos.length;
}

/* ---------------- archivos binarios, enlaces y correo ---------------- */

/** Sube un archivo (Blob) a la carpeta de la app. Usa sesión de carga para archivos grandes. */
export async function subirArchivo(ruta, blob, tipo) {
  if (blob.size < 4 * 1024 * 1024) {
    const r = await g(`${await rutaItem(ruta)}:/content?@microsoft.graph.conflictBehavior=replace`, { method: 'PUT', headers: { 'Content-Type': tipo || blob.type || 'application/octet-stream' }, body: blob, raw: true });
    if (!r.ok) throw new Error(`No se pudo subir ${ruta} (${r.status})`);
    return r.json();
  }
  const ses = await g(`${await rutaItem(ruta)}:/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
  const PARTE = 320 * 1024 * 10; // múltiplo de 320 KiB
  let res = null;
  for (let ini = 0; ini < blob.size; ini += PARTE) {
    const fin = Math.min(blob.size, ini + PARTE);
    const r = await fetch(ses.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${ini}-${fin - 1}/${blob.size}` }, body: blob.slice(ini, fin) });
    if (!r.ok && r.status !== 202) throw new Error(`Falló la carga de ${ruta} (${r.status})`);
    if (r.status === 200 || r.status === 201) res = await r.json();
  }
  return res;
}

/** Enlace para ver el archivo (para personas de la organización). Si la política no lo permite, usa la URL del archivo. */
export async function crearEnlace(ruta) {
  const item = await g(`${await rutaItem(ruta)}?$select=id,webUrl`);
  try {
    const l = await g(`drives/${await drive()}/items/${item.id}/createLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'view', scope: 'organization' }) });
    return l.link?.webUrl || item.webUrl;
  } catch { return item.webUrl; }
}

const scopesDelToken = () => {
  try { return JSON.parse(atob(ls.get(TOKEN_KEY).access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).scp || ''; } catch { return ''; }
};
/** Pide (una sola vez) el permiso para enviar correos desde la cuenta del usuario. */
export async function asegurarPermisoCorreo() {
  if (/\bMail\.Send\b/i.test(scopesDelToken())) return;
  await login(['Mail.Send']);
  if (!/\bMail\.Send\b/i.test(scopesDelToken())) throw new Error('Microsoft no otorgó el permiso para enviar correos (Mail.Send).');
}

/** Envía un correo desde la cuenta del usuario conectado (Outlook / Microsoft 365). */
export async function enviarCorreo({ para, cc = [], asunto, html }) {
  const dir = (l) => l.map((address) => ({ emailAddress: { address } }));
  const r = await g('me/sendMail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, raw: true,
    body: JSON.stringify({ message: { subject: asunto, body: { contentType: 'HTML', content: html }, toRecipients: dir(para), ccRecipients: dir(cc) }, saveToSentItems: true }),
  });
  if (!r.ok) { let m = `${r.status}`; try { m = (await r.json()).error?.message || m; } catch { /* */ } throw new Error(`No se pudo enviar el correo: ${m}`); }
}

export async function eliminarArchivo(nombre) {
  const r = await g(await rutaItem(nombre), { method: 'DELETE', raw: true });
  if (!r.ok && r.status !== 404) throw new Error(`No se pudo eliminar ${nombre} (${r.status})`);
}

export async function urlCarpeta() {
  try { return (await g(`${(await rutaItem('')).replace(/\/$/, '').replace(/:\/?$/, '')}?$select=webUrl`)).webUrl; } catch { return getCfg().spSite; }
}
