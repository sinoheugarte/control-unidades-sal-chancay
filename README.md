# Control de Unidades – Despacho, Acopio y Embarque

Aplicación web para controlar el transporte de **sal a granel** desde planta hasta
puerto y su embarque a la nave. Reemplaza el libro Excel
*REPORTE DE CONTROL UNIDADES SAL* (ver el análisis completo en
[`docs/ANALISIS_EXCEL.md`](docs/ANALISIS_EXCEL.md)).

## Funcionalidades

- **Ingreso web con usuario y contraseña** y roles: *admin*, *operador* (carga datos), *lector* (sólo consulta).
- **Operaciones** por nave / orden (nave, manifiesto, DAM, ETA, cliente, TN programadas, draft SGS).
- **Registro rápido** pensado para celular:
  1. *Salida de planta*: placa, guía, peso y hora (el transportista se detecta por la placa).
  2. *Recepción en puerto*: placa + ticket + peso neto; se asigna solo al viaje pendiente más antiguo de esa placa.
- **Detalle de viajes** con todas las columnas calculadas del Excel (vuelta, diferencia de pesos, acumulado, restante, tiempo y rango de atención, status), filtros y edición.
- **Reportes por turno** de despacho, acopio y embarque, con TN restantes, viajes/horas estimadas y fecha estimada de término.
- **Tablero** con KPIs, avance, gráficos por jornada, transportista y tiempos de atención, y balance (planta → puerto → embarque → draft SGS).
- **Transportistas**: participación por operación (unidades solicitadas, TN aproximadas, viajes, TN finales, observaciones) y reporte de servicio exportable a Excel con conformidad.
- **Lista de unidades** (conductores, DNI, brevete, tracto, plataforma) con normalización de placas.
- **Resúmenes** por día y jornada, vueltas por unidad y tiempos de atención.
- **Planificación** (pre-acopio): viajes, horas, término estimado, *round trip* y unidades necesarias.
- **Importación** del reporte SAP de planta, del reporte de tickets de balanza, de la lista de unidades y **del libro completo** (.xlsm) para migrar una operación existente.
- **Exportación** a Excel.

## Requisitos

- Node.js 20 o superior.

## Instalación y uso local

```bash
npm install
```

```bash
ADMIN_PASSWORD='una-clave-segura' npm start
```

Abra <http://localhost:3000> e ingrese con el usuario `admin`. Si no define
`ADMIN_PASSWORD`, se genera una contraseña temporal y se muestra en la consola la
primera vez que arranca.

Para cargar la operación de ejemplo, vaya a **Importar datos → Libro completo** y
suba el archivo `.xlsm`.

### Variables de entorno

Ver [`.env.example`](.env.example): `PORT`, `DB_PATH`, `ADMIN_USER`, `ADMIN_PASSWORD`,
`SESSION_HOURS`, `COOKIE_SECURE` (poner `1` detrás de HTTPS).

## Despliegue con Docker

```bash
docker build -t control-unidades .
```

```bash
docker run -d -p 3000:3000 -v control-data:/data -e ADMIN_PASSWORD='una-clave-segura' control-unidades
```

La base de datos SQLite queda en el volumen `/data`. Sirve para cualquier
proveedor que ejecute contenedores con disco persistente (Render, Railway, Fly.io,
un VPS, etc.). Detrás de HTTPS, defina `COOKIE_SECURE=1`.

## Estructura

```
src/
  server.js      API REST (Express) y archivos estáticos
  db.js          Esquema SQLite
  auth.js        Sesiones, contraseñas (bcrypt) y roles
  calc.js        Lógica de cálculo replicada del Excel
  importers.js   Importación de Excel/CSV (SAP planta, tickets puerto, lista, libro completo)
  exporters.js   Exportación a Excel
public/          Interfaz web (HTML + JS sin compilación, Chart.js)
test/            Pruebas de la lógica de cálculo (npm test)
docs/            Análisis del libro Excel original
```

## Pruebas

```bash
npm test
```

## Privacidad

Los libros Excel contienen datos personales (DNI, teléfonos, correos). Están
excluidos del repositorio (`.gitignore`); súbalos sólo a través de la aplicación.
