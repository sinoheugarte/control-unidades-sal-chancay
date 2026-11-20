# Control de Unidades – Despacho, Acopio y Embarque

Aplicación web para controlar el transporte de **sal a granel** desde planta hasta
puerto y su embarque a la nave. Reemplaza el libro Excel
*REPORTE DE CONTROL UNIDADES SAL* (ver el análisis en
[`docs/ANALISIS_EXCEL.md`](docs/ANALISIS_EXCEL.md)).

Funciona igual que **Pacifico TP Reporte**:

- Se publica en **GitHub Pages**: no hay que pagar ningún servidor.
- Se ingresa con la **cuenta Microsoft 365** de la empresa.
- Los datos se guardan en **SharePoint**, en el sitio `PacificoTP`, dentro de la carpeta `Control Unidades Sal`.

**Enlace:** https://sinoheugarte.github.io/control-unidades-sal-chancay/

## Funcionalidades

- **Operaciones** por nave / orden (manifiesto, DAM, ETA, cliente, TN programadas, draft SGS).
- **Registro rápido** desde el celular:
  1. Salida de planta: placa, guía, peso y hora.
  2. Recepción en puerto: placa, ticket y peso. Se asigna sola al viaje pendiente de esa placa.
- **Detalle de viajes** con todas las columnas calculadas del Excel: vuelta, diferencia de pesos, acumulado, restante, tiempo y rango de atención, status.
- **Reportes por turno** de despacho, acopio y embarque, con TN restantes y fecha estimada de término.
- **Tablero** con indicadores, gráficos y el balance planta → puerto → embarque → draft SGS.
- **Transportistas**, con el reporte de servicio de cada uno exportable a Excel.
- **Lista de unidades**, **resúmenes** y **planificación** (pre-acopio).
- **Importación** del libro `.xlsm` completo, del reporte SAP de planta, de los tickets de balanza y de la lista de unidades.
- **Roles** por correo: *admin*, *operador* y *lector*.
- **Varios usuarios a la vez:** cada guardado comprueba si otro usuario cambió el archivo antes y, si fue así, recarga y vuelve a aplicar el cambio sin perder datos.

## Configuración (una sola vez)

Usa el mismo registro de aplicación de Entra ID (Azure) que *Pacifico TP Reporte*.

1. **Registrar la dirección de retorno en Entra ID.**
   - Entra a portal.azure.com → *Microsoft Entra ID* → *Registros de aplicaciones*, y abre la app que usa Pacifico TP.
   - Ve a *Autenticación* y, en la plataforma **Aplicación de página única (SPA)**, agrega:
     `https://sinoheugarte.github.io/control-unidades-sal-chancay/`
2. **Activar GitHub Pages.**
   - En el repositorio entra a *Settings → Pages* y en *Source* elige **GitHub Actions**.
   - GitHub Pages en repositorios privados necesita un plan pago de GitHub. Con plan gratuito, el repositorio tiene que ser público, igual que el de Pacifico TP.
   - El código no contiene datos de la operación: esos quedan en SharePoint.
3. **Dar acceso en SharePoint.** Los usuarios necesitan permiso de **edición** en el sitio `PacificoTP` para guardar datos.
4. **Primer ingreso.**
   - Mientras no haya usuarios registrados en la sección **Usuarios**, todos los que entran son administradores.
   - Registra a tu equipo con su correo y su rol. Luego define qué rol reciben los que no están registrados (*lector* por defecto).
5. **Cargar la operación.** En **Importar datos → Libro completo**, sube el `.xlsm`.

Cada `push` a `main` ejecuta las pruebas y vuelve a publicar la app automáticamente (`.github/workflows/pages.yml`).

En la pantalla de inicio, *Configuración avanzada* permite cambiar el sitio de SharePoint, la carpeta, el Client ID y el Tenant ID.

## Desarrollo local

```bash
npm start
```

Abre <http://localhost:8080>. Para iniciar sesión, esa dirección también debe estar registrada como Redirect URI (SPA) en Entra ID.

```bash
npm test
```

## Estructura

```
web/
  index.html
  css/app.css
  js/app.js            Navegación, inicio de sesión
  js/graph.js          Microsoft login (OAuth2 + PKCE) y archivos en SharePoint (Microsoft Graph)
  js/backend.js        Operaciones sobre los datos (viajes, reportes, transportistas…) con control de concurrencia
  js/calc.js           Lógica de cálculo replicada del Excel
  js/excel.js          Importación / exportación de Excel (ExcelJS)
  js/views-*.js        Pantallas
  vendor/              ExcelJS y Chart.js
test/                  Pruebas de cálculo
docs/                  Análisis del libro Excel original
```

## Datos en SharePoint

```
Control Unidades Sal/
  indice.json      operaciones, transportistas y roles de usuario
  op-1.json        datos de la operación 1 (viajes, unidades, reportes, embarque, historial)
```
