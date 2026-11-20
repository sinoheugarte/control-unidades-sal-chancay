'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, audit } = require('./db');

const COOKIE = 'cus_sid';
const TTL_HORAS = Number(process.env.SESSION_HOURS || 12);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function ensureAdmin() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (n > 0) return;
  const usuario = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?,?,?,?)')
    .run(usuario, 'Administrador', bcrypt.hashSync(pass, 10), 'admin');
  if (!process.env.ADMIN_PASSWORD) {
    console.log('==============================================');
    console.log(` Usuario administrador creado: ${usuario}`);
    console.log(` Contraseña temporal:          ${pass}`);
    console.log(' Cámbiela desde la sección Usuarios.');
    console.log('==============================================');
  }
}

function login(req, res) {
  const { usuario, password } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(String(usuario || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + TTL_HORAS * 3600e3).toISOString();
  db.prepare('DELETE FROM sesiones WHERE expira_en < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?,?,?)').run(sha(token), u.id, exp);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_HORAS * 3600}${secure}`);
  audit(u.id, 'login', u.usuario);
  res.json({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
}

function logout(req, res) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  if (t) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(sha(t));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
}

function sessionUser(req, _res, next) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  if (t) {
    const row = db.prepare(`SELECT u.id, u.usuario, u.nombre, u.rol FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`)
      .get(sha(t), new Date().toISOString());
    if (row) req.user = row;
  }
  next();
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sesión no iniciada' }));

/** Lector: sólo lectura. Operador: carga de datos. Admin: todo. */
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sesión no iniciada' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    next();
  };
}

module.exports = { ensureAdmin, login, logout, sessionUser, requireAuth, requireRol, bcrypt };
