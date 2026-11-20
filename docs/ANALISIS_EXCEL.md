# Análisis del libro «REPORTE DE CONTROL UNIDADES SAL – MV TURBO S – ORDEN 2052»

El libro `.xlsm` controla una operación logística de **sal a granel de exportación**:
la sal se carga en camiones (tolvas) en la **planta de Huacho**, viaja al puerto
(**Cosco Shipping Puerto Chancay – CSPCP**), se descarga y acopia allí, y luego se
**embarca** a la nave (MV TURBO S, cliente QUIMPAC S.A., destino Guayaquil – Ecuasal).
Pacífico Despachos S.A.C. coordina a varias empresas de transporte.

## Hojas y su función

| Hoja | Qué contiene | Cómo se usa en la app |
|---|---|---|
| **PREACOPIO** | Planificación: TN totales (20 060), TN por unidad (36), viajes por hora (8), jornadas por día (3) → viajes totales (558), horas/días de acopio y fecha de término. Embarque a 1 166 TN/h. *Round trip* por etapas (3 h) → unidades mínimas (24) y necesarias +50 % (36). | Pantalla **Planificación** (parámetros editables). |
| **RESUMEN EMBARQUE** | Datos de la nave (nave, orden, manifiesto, DAM, ETA), etapas de atraque (1ETB…4ETB) con inicio/fin, hasta 20 reportes de embarque con TN acumuladas tipeadas → TN parcial, TN/hora, TN restantes, horas estimadas y fecha estimada de término. TN draft SGS. | **Reportes por turno → Proceso de embarque**. |
| **REPORTES** | Hasta 20 reportes de **despacho** y 20 de **acopio**, cada uno con ventana inicio–fin. Suma TN y viajes de los registros con ese número de reporte y calcula promedios, acumulados, TN restantes, viajes y horas estimadas restantes y fecha estimada de término. | **Reportes por turno** (despacho / acopio). La app asigna cada viaje al reporte cuya ventana contiene su hora (o al número que se fije manualmente). |
| **RESUMEN ACOPIO** | Consolidados (tablas dinámicas) por transportista de despacho y recepción; % de avance; **balance** (despachado, rechazado, acopiado, diferencia de pesos, embarque, draft SGS); tiempos de atención en puerto por rango. | **Tablero** (KPIs, gráficos y balance) y **Resúmenes**. |
| **RESUMEN 2** | Tabla dinámica: viajes y TN por **día y jornada** (07–16, 16–23, 23–07) para despacho y acopio. | **Resúmenes** y gráfico del tablero. |
| **RESUMEN 3** | Viajes por placa y distribución de **vueltas** por unidad. | **Resúmenes** y **Lista de unidades**. |
| **TRANSPORTISTAS** | Por empresa: unidades solicitadas, unidades en lista, TN prom., viajes y TN aproximadas, unidades activas, viajes realizados, TN finales, observación («NO PARTICIPO», «VIAJES DE SAL DEVUELTOS»), reporte confirmado. | **Transportistas** (participación + maestro). |
| **LISTA** (Tabla18) | Lista SIO de conductores: RUC, apellidos, nombres, DNI, brevete, placa de tracto y plataforma. Una macro normaliza placas (quita guiones y espacios). | **Lista de unidades** (la normalización se aplica siempre). |
| **DETALLE TRANSPORTE** (Tabla777) | **Tabla central**: un registro por viaje. Ver columnas abajo. | **Detalle de viajes** y **Registro rápido**. |
| **REPORTE HUACHO** | Exportación SAP de despachos de planta (guía = *Referencia*, placa, peso, fechas/horas de carga y salida, transportista). | **Importar → Despachos de planta**. |
| **REPORTE CSPCP** (Tabla8) | Tickets de balanza del puerto: placa, ticket, peso neto, hora de ingreso y salida; columna VUELTA = n-ésima aparición de la placa. | **Importar → Tickets de balanza** o **Registro rápido → Recepción**. |
| TOLVEROS, RIAR, INV_CATCON, … | Reporte de servicio por transportista (FILTER/SORT de la tabla de viajes) con cabecera de la operación, totales y **conformidad**. | Botón **Reporte** en Transportistas (exporta Excel). |
| BASE | RUC ↔ razón social ↔ nombre comercial; placas por empresa; lista de status. | Maestro de transportistas. |
| CONTACTOS (oculta) | Contactos de otras empresas. | Campos contacto/teléfono/correos del transportista. |

## Columnas calculadas de DETALLE TRANSPORTE (replicadas en `src/calc.js`)

| Columna | Fórmula original | Implementación |
|---|---|---|
| NRO. VIAJE | correlativo | orden por fecha/hora de despacho |
| TICKET / PESO / HORA INGRESO / SALIDA CSPCP | `INDEX/MATCH` sobre REPORTE CSPCP por **placa + vuelta** | se guardan en el viaje al importar o registrar el ticket (al viaje pendiente más antiguo de la placa) |
| PESO TN X UNID CSPCP | si no hay ticket → peso Huacho | igual (`peso_destino_calc`); además se informa TN «en tránsito» por separado |
| REDONDEO X TN DEV | si devuelto y < 30 TN → 30 | igual |
| DIFERENCIA HUACHO – CSPCP | peso puerto − peso planta | igual (sólo descargados) |
| CANT. ACUM. TN / CANT. REST. TN | acumulado y restante vs TN programadas | igual |
| TIPO DE VIAJE | ticket «-» → «TN DEVUELTAS», si no «ACOPIO» | igual |
| TIEMPO / RANGO | salida − ingreso; `<=30 MIN`, `>30 MIN - <1 HR`, `>=1 HR` | igual |
| VIAJE X UNIDAD | `COUNTIF` de la placa hasta la fila | igual (`vuelta`) |
| STATUS | sin ticket → «FALTA DESCARGAR»; «-» → «TN DEVUELTAS»; si no «DESCARGADO» | igual |

## Validación con los datos de la Orden 2052

Al importar el libro, la app reproduce los totales del Excel:

- 541 viajes · 61 unidades activas · 63 unidades en lista
- TN despachadas en planta **20 117.25** · TN acopiadas en puerto **20 131.00** · diferencia **13.75**
- TN embarcadas **20 130.70** (dif. −0.30) · draft SGS **20 087.14** (dif. −43.56)
- Tolveros 370 viajes / 13 734.50 TN · Inv. Catcon 84 / 3 156.28 · Riar 36 / 1 343.60 · Paar 35 / 1 304.70 · C. Plasencia 16 / 591.92
- Planificación: 558 viajes, 69:45 h, término 23/10/2026 08:45, 24 unidades mínimas / 36 necesarias

## Mejoras respecto al Excel

- Acceso web multiusuario con roles (admin / operador / lector) y auditoría.
- Varias operaciones (naves/órdenes) en una sola base, sin copiar el libro.
- Registro en campo desde el celular: salida de planta y recepción de ticket en puerto.
- El cruce placa + vuelta ya no depende de que el reporte CSPCP esté completo y ordenado.
- TN «en tránsito» separadas de las TN realmente descargadas.
- Exportación a Excel del detalle y de cada reporte de servicio por transportista.
