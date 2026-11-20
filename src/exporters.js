'use strict';
const ExcelJS = require('exceljs');

const AZUL = 'FF1F3A5F';
const head = (row) => {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  row.height = 30;
};

const COLS_DETALLE = [
  ['DIA DESPACHO', 'fecha_despacho', 13], ['JORNADA DESPACHO', 'jornada_despacho', 15], ['NRO. VIAJE', 'nro', 8],
  ['TRANSPORTE', 'transportista_nombre', 18], ['PLACA', 'placa', 10], ['GUIA R.', 'guia', 19],
  ['PESO TN ORIGEN', 'peso_origen', 11], ['DIA RECEPCION', 'fecha_recepcion', 13], ['JORNADA RECEPCION', 'jornada_recepcion', 15],
  ['TICKET', 'ticket', 15], ['PESO TN DESTINO', 'peso_destino_calc', 11], ['REDONDEO X TN DEV', 'redondeo', 11],
  ['DIFERENCIA', 'diferencia', 10], ['CANT. ACUM. TN', 'acumulado', 12], ['CANT. REST. TN', 'restante', 12],
  ['TIPO DE VIAJE', 'tipo', 13], ['HORA INGRESO', 'ingreso_en', 18], ['HORA SALIDA', 'salida_en', 18],
  ['TIEMPO (MIN)', 'tiempo_min', 9], ['RANGO', 'rango', 15], ['# REPORTE DESPACHO', 'rep_despacho_calc', 10],
  ['# REPORTE ACOPIO', 'rep_acopio_calc', 10], ['VIAJE X UNIDAD', 'vuelta', 9], ['STATUS', 'status', 16],
];

function titulo(ws, op, texto, ncols) {
  ws.mergeCells(1, 1, 1, ncols);
  ws.getCell(1, 1).value = op.empresa || 'PACIFICO DESPACHOS S.A.C.';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells(2, 1, 2, ncols);
  ws.getCell(2, 1).value = `${texto} — ${op.nave} / ORDEN ${op.orden}`;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
}

async function exportarDetalle(op, viajes, tot) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control de Unidades';
  const ws = wb.addWorksheet('DETALLE TRANSPORTE', { views: [{ state: 'frozen', ySplit: 5 }] });
  titulo(ws, op, 'DETALLE TRANSPORTE', COLS_DETALLE.length);
  ws.getCell('A3').value = `TN programadas: ${tot.tn_programadas}  |  TN despacho: ${tot.tn_despacho}  |  TN acopio: ${tot.tn_acopio}  |  Viajes: ${tot.viajes}`;
  ws.getRow(5).values = COLS_DETALLE.map((c) => c[0]);
  head(ws.getRow(5));
  COLS_DETALLE.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  for (const v of viajes) ws.addRow(COLS_DETALLE.map((c) => v[c[1]] ?? ''));
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS_DETALLE.length } };
  return wb.xlsx.writeBuffer();
}

/** Reporte de servicio por transportista (hojas TOLVEROS, RIAR, ...). */
async function exportarTransportista(op, t, viajes) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(String(t.nombre_comercial).slice(0, 31));
  const cols = COLS_DETALLE.slice(0, 11);
  titulo(ws, op, 'REPORTE DE SERVICIO TRANSPORTE', cols.length);
  const info = [
    ['VAPOR:', op.nave, 'CLIENTE:', op.cliente], ['PRODUCTO:', op.producto, 'DAM:', op.dam],
    ['FECHA INICIO:', op.fecha_inicio, 'REFERENCIA:', op.referencia],
    ['PUNTO SALIDA:', op.punto_salida, 'TOTAL VIAJES:', viajes.length],
    ['PUNTO LLEGADA:', op.punto_llegada, 'TOTAL PESO TM ORIGEN:', round(viajes.reduce((s, v) => s + (v.peso_origen || 0), 0))],
    ['EMPRESA DE TRANSPORTE:', t.razon_social, 'RUC:', t.ruc],
    ['', '', 'TOTAL PESO TM DESTINO:', round(viajes.reduce((s, v) => s + (v.peso_destino_calc || 0), 0))],
  ];
  info.forEach((r, i) => {
    const row = ws.getRow(4 + i);
    row.getCell(1).value = r[0]; row.getCell(3).value = r[1] ?? '';
    row.getCell(7).value = r[2]; row.getCell(9).value = r[3] ?? '';
    row.getCell(1).font = row.getCell(7).font = { bold: true };
  });
  const h = 12;
  ws.getRow(h).values = cols.map((c) => c[0]);
  head(ws.getRow(h));
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  const orden = [...viajes].sort((a, b) => a.nro - b.nro);
  for (const v of orden) ws.addRow(cols.map((c) => v[c[1]] ?? ''));
  const tr = ws.addRow(['Total', '', orden.length, '', '', '', round(orden.reduce((s, v) => s + (v.peso_origen || 0), 0)), '', '', '',
    round(orden.reduce((s, v) => s + (v.peso_destino_calc || 0), 0))]);
  tr.font = { bold: true };
  ws.addRow([]);
  ws.addRow(['** CONFORMIDAD ACEPTADA **', '', '', '', '', '', '', '', '', op.coordinador || '']);
  ws.addRow(['FECHA:', '', '', '', '', '', '', '', '', 'Coordinador de Transporte']);
  ws.addRow([`APROBADO: ${op.coordinador || ''}`, '', '', '', '', '', '', '', '', op.empresa || '']);
  return wb.xlsx.writeBuffer();
}

const round = (n) => Math.round(n * 1000) / 1000;

module.exports = { exportarDetalle, exportarTransportista };
