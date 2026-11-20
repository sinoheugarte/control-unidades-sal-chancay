'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'control.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'operador' CHECK (rol IN ('admin','operador','lector')),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TEXT NOT NULL
);

-- Una operación = una nave / orden (ej. MV TURBO S - Orden 2052)
CREATE TABLE IF NOT EXISTS operaciones (
  id INTEGER PRIMARY KEY,
  nave TEXT NOT NULL,
  orden TEXT NOT NULL,
  manifiesto TEXT, dam TEXT, eta TEXT,
  cliente TEXT, producto TEXT, referencia TEXT,
  punto_salida TEXT, punto_llegada TEXT,
  empresa TEXT DEFAULT 'PACIFICO DESPACHOS S.A.C.',
  coordinador TEXT,
  fecha_inicio TEXT,
  tn_programadas REAL NOT NULL DEFAULT 0,
  tn_embarque_programadas REAL,
  tn_draft_sgs REAL,
  -- parámetros de planificación (hoja PREACOPIO) en JSON
  params TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'EN CURSO',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transportistas (
  id INTEGER PRIMARY KEY,
  ruc TEXT UNIQUE NOT NULL,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT NOT NULL UNIQUE,
  contacto TEXT, telefono TEXT, emails TEXT
);

-- Participación de cada transportista en una operación (hoja TRANSPORTISTAS)
CREATE TABLE IF NOT EXISTS op_transportistas (
  operacion_id INTEGER NOT NULL REFERENCES operaciones(id) ON DELETE CASCADE,
  transportista_id INTEGER NOT NULL REFERENCES transportistas(id) ON DELETE CASCADE,
  unidades_solicitadas INTEGER NOT NULL DEFAULT 0,
  tn_prom_unidad REAL NOT NULL DEFAULT 33,
  tn_asignadas REAL,
  reporte_confirmado INTEGER NOT NULL DEFAULT 0,
  observacion TEXT,
  PRIMARY KEY (operacion_id, transportista_id)
);

-- Lista de unidades / conductores (hoja LISTA - Lista SIO)
CREATE TABLE IF NOT EXISTS unidades (
  id INTEGER PRIMARY KEY,
  operacion_id INTEGER NOT NULL REFERENCES operaciones(id) ON DELETE CASCADE,
  transportista_id INTEGER REFERENCES transportistas(id),
  ap_paterno TEXT, ap_materno TEXT, nombre1 TEXT, nombre2 TEXT,
  dni TEXT, brevete TEXT,
  tracto TEXT, plataforma TEXT
);
CREATE INDEX IF NOT EXISTS ix_unidades_op ON unidades(operacion_id, tracto);

-- Viajes (hoja DETALLE TRANSPORTE)
CREATE TABLE IF NOT EXISTS viajes (
  id INTEGER PRIMARY KEY,
  operacion_id INTEGER NOT NULL REFERENCES operaciones(id) ON DELETE CASCADE,
  transportista_id INTEGER REFERENCES transportistas(id),
  placa TEXT NOT NULL,
  -- Despacho (planta origen, ej. Huacho)
  fecha_despacho TEXT NOT NULL,
  jornada_despacho TEXT,
  despacho_en TEXT,          -- fecha-hora de salida (para asignar reporte)
  guia TEXT,
  peso_origen REAL,
  -- Recepción (puerto, ej. CSPCP)
  fecha_recepcion TEXT,
  jornada_recepcion TEXT,
  ticket TEXT,               -- '-' = TN devueltas
  peso_destino REAL,
  ingreso_en TEXT,
  salida_en TEXT,
  rep_despacho INTEGER,      -- nro. reporte despacho (manual; si es NULL se calcula por ventana)
  rep_acopio INTEGER,
  observacion TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por INTEGER REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS ix_viajes_op ON viajes(operacion_id, placa);
CREATE UNIQUE INDEX IF NOT EXISTS ux_viajes_guia ON viajes(operacion_id, guia) WHERE guia IS NOT NULL AND guia <> '';

-- Ventanas de reporte (hoja REPORTES y RESUMEN EMBARQUE)
CREATE TABLE IF NOT EXISTS reportes (
  id INTEGER PRIMARY KEY,
  operacion_id INTEGER NOT NULL REFERENCES operaciones(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despacho','acopio','embarque')),
  numero INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  fin TEXT,
  tn_acumulado REAL,         -- sólo embarque: TN total embarcadas al cierre
  observacion TEXT,
  UNIQUE (operacion_id, tipo, numero)
);

-- Etapas de embarque (1ETB, 2ETB...)
CREATE TABLE IF NOT EXISTS embarque_etapas (
  id INTEGER PRIMARY KEY,
  operacion_id INTEGER NOT NULL REFERENCES operaciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  inicio TEXT, fin TEXT,
  observacion TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT,
  en TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function audit(usuarioId, accion, detalle) {
  db.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?,?,?)')
    .run(usuarioId || null, accion, typeof detalle === 'string' ? detalle : JSON.stringify(detalle));
}

module.exports = { db, audit, DB_PATH };
