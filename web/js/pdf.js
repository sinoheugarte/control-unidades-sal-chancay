// Exportación a PDF (jsPDF + AutoTable): detalle de viajes y reporte de servicio por transportista.
import { COLS_DETALLE, COLS_TRANSP, COLS_UNIDADES, COLS_RESUMEN_T, FILAS_CORTE, logoBase64 } from './excel.js?v=__V__';

const AZUL = [31, 78, 121];
const nf = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (v) => (v === null || v === undefined || v === '' ? '' : nf.format(v));
const fecha = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fh = (s) => (s ? `${fecha(s)} ${String(s).slice(11, 19)}` : '');
const hms = (min) => (min === null || min === undefined ? '' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}:00`);
const suma = (vs, k) => Math.round(vs.reduce((s, v) => s + (Number(v[k]) || 0), 0) * 1000) / 1000;

function texto(v, k, tipo) {
  const x = k === 'conteo' ? 1 : v[k];
  if (x === null || x === undefined) return '';
  if (tipo === 'f') return fecha(x);
  if (tipo === 'dt') return fh(x);
  if (tipo === 'h') return hms(x);
  if (tipo === 'n') return n2(x);
  return String(x);
}

function nuevoDoc(formato) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: formato, compress: true });
}

function piePaginas(doc, op) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(120);
    doc.text(`${(op.empresa || '').trim()} · ${op.nave}${op.orden && op.orden !== '-' ? ` / Orden ${op.orden}` : ''} · Generado ${new Date().toLocaleString('es-PE', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 10, h - 6);
    doc.text(`Página ${i} de ${n}`, w - 10, h - 6, { align: 'right' });
  }
  doc.setTextColor(0);
}

async function encabezado(doc, op, titulo) {
  const w = doc.internal.pageSize.getWidth();
  const logo = await logoBase64();
  if (logo) doc.addImage(logo, 'PNG', 10, 6, 30, 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...AZUL);
  doc.text((op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim(), 44, 13);
  doc.setFontSize(11); doc.setTextColor(0);
  doc.text(titulo, 44, 20);
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.6); doc.line(10, 26, w - 10, 26);
  return 30;
}

const blob = (doc) => doc.output('blob');

/** DETALLE TRANSPORTE completo (A3 horizontal). */
export async function pdfDetalle(op, viajes, tot) {
  const doc = nuevoDoc('a3');
  let y = await encabezado(doc, op, `DETALLE TRANSPORTE — ${op.nave} / ORDEN ${op.orden}`);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const resumen = [
    ['# VIAJES', String(tot.viajes)], ['TN PROG.', n2(tot.tn_programadas)], ['TN DESPACHO', n2(tot.tn_despacho)],
    ['TN ACOPIO', n2(tot.tn_acopio)], ['TN DEVUELTAS', n2(tot.tn_devueltas)], ['TN EN TRÁNSITO', n2(tot.tn_transito)], ['PESO PROM.', n2(tot.peso_prom_unidad)],
  ];
  let x = 10;
  for (const [l, v] of resumen) { doc.setFont('helvetica', 'bold'); doc.text(`${l}:`, x, y); doc.setFont('helvetica', 'normal'); doc.text(v, x + doc.getTextWidth(`${l}: `), y); x += 55; }
  doc.autoTable({
    startY: y + 4,
    head: [COLS_DETALLE.map((c) => c[0])],
    body: viajes.map((v) => COLS_DETALLE.map(([, k, , t]) => texto(v, k, t))),
    foot: [['TOTAL', '', String(viajes.length), '', '', '', n2(suma(viajes, 'peso_origen')), '', '', String(viajes.filter((v) => v.ticket).length),
      n2(suma(viajes, 'peso_destino_calc')), n2(suma(viajes, 'diferencia')), '', '', '', '', '', '', '', '', '', '', '', '']],
    styles: { fontSize: 6, cellPadding: 0.8, overflow: 'linebreak', lineColor: [200, 200, 200], lineWidth: 0.1 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 6 },
    footStyles: { fillColor: [235, 240, 246], textColor: 0, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(COLS_DETALLE.map(([, , , t], i) => [i, { halign: t && t !== 'f' && t !== 'dt' ? 'right' : 'left' }])),
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 8, right: 8, bottom: 12 },
    showFoot: 'lastPage',
  });
  piePaginas(doc, op);
  return blob(doc);
}

/** Dibuja el "REPORTE DE SERVICIO TRANSPORTE" de un transportista en el documento. */
async function paginaTransportista(doc, op, t, viajes) {
  const w = doc.internal.pageSize.getWidth();
  let y = await encabezado(doc, op, 'REPORTE DE SERVICIO TRANSPORTE');
  const orden = [...viajes].sort((a, b) => a.nro - b.nro);
  const info = [
    ['VAPOR:', op.nave, 'CLIENTE:', op.cliente],
    ['PRODUCTO:', op.producto, 'DAM:', op.dam],
    ['FECHA INICIO:', /[ T]\d{2}:\d{2}/.test(String(op.fecha_inicio || '')) && !/[ T]00:00/.test(String(op.fecha_inicio)) ? fh(op.fecha_inicio).slice(0, 16) : fecha(op.fecha_inicio), 'REFERENCIA:', op.referencia],
    ['PUNTO SALIDA:', op.punto_salida, 'TOTAL VIAJES:', String(orden.length)],
    ['PUNTO LLEGADA:', op.punto_llegada, 'TOTAL PESO TM HUACHO:', n2(suma(orden, 'peso_origen'))],
    ['EMPRESA DE TRANSPORTE:', t.razon_social, 'RUC:', t.ruc],
    ['', '', 'TOTAL PESO TM CSPCP:', n2(suma(orden, 'peso_destino_calc'))],
  ];
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  const x1 = 10 + Math.max(...info.map((r) => doc.getTextWidth(r[0]))) + 3;
  const x2l = 118, x2 = x2l + Math.max(...info.map((r) => doc.getTextWidth(r[2]))) + 3;
  info.forEach(([l1, v1, l2, v2], i) => {
    const yy = y + i * 4.6;
    doc.setFont('helvetica', 'bold'); doc.text(l1, 10, yy); doc.text(l2, x2l, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(String(v1 ?? ''), x2l - x1 - 3)[0] || '', x1, yy);
    doc.text(doc.splitTextToSize(String(v2 ?? ''), w - 82 - x2)[0] || '', x2, yy);
  });
  // Contacto del transportista (recuadro a la derecha)
  const emails = String(t.emails || '').split(/[,;]\s*/).filter(Boolean).slice(0, 4);
  const cx = w - 78;
  doc.setDrawColor(200); doc.setLineWidth(0.2); doc.roundedRect(cx - 3, y - 4, 71, 34, 1.5, 1.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...AZUL); doc.text(String(t.nombre_comercial || ''), cx, y); doc.setTextColor(0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  let cy = y + 4.5;
  if (t.contacto) { doc.text(`Contacto: ${t.contacto}`, cx, cy); cy += 4; }
  if (t.telefono) { doc.text(`Teléfono: ${t.telefono}`, cx, cy); cy += 4; }
  emails.forEach((e) => { doc.text(e, cx, cy); cy += 3.8; });
  y += info.length * 4.6 + 3;

  doc.autoTable({
    startY: y,
    head: [COLS_TRANSP.map((c) => c[0])],
    body: orden.map((v) => COLS_TRANSP.map(([, k, , tt]) => texto(v, k, tt))),
    foot: [['Total', '', String(orden.length), '', '', '', n2(suma(orden, 'peso_origen')), '', n2(suma(orden, 'peso_destino_calc'))]],
    styles: { fontSize: 7.5, cellPadding: 1, lineColor: [200, 200, 200], lineWidth: 0.1 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    footStyles: { fillColor: [235, 240, 246], textColor: 0, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(COLS_TRANSP.map(([, , , tt], i) => [i, { halign: tt && tt !== 'f' ? 'right' : 'left' }])),
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 10, right: 10, bottom: 14, top: 12 },
    showFoot: 'lastPage', showHead: 'everyPage',
  });
  // Conformidad
  let fy = doc.lastAutoTable.finalY + 14;
  const h = doc.internal.pageSize.getHeight();
  if (fy > h - 30) { doc.addPage(); fy = 30; }
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('** CONFORMIDAD ACEPTADA **', 10, fy);
  doc.setFont('helvetica', 'normal');
  doc.text('FECHA:', 10, fy + 6);
  doc.text(`APROBADO: ${(op.coordinador || '').toUpperCase()}`, 10, fy + 12);
  doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(w - 95, fy - 4, w - 20, fy - 4);
  doc.setFont('helvetica', 'bold'); doc.text(op.coordinador || '', w - 57.5, fy, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Coordinador de Transporte', w - 57.5, fy + 5, { align: 'center' });
  doc.text((op.empresa || 'PACIFICO DESPACHOS S.A.C.').trim(), w - 57.5, fy + 10, { align: 'center' });
}

export async function pdfTransportista(op, t, viajes) {
  const doc = nuevoDoc('a4');
  await paginaTransportista(doc, op, t, viajes);
  piePaginas(doc, op);
  return blob(doc);
}

/** Todos los transportistas en un solo PDF (uno a continuación del otro). */
export async function pdfTransportistas(op, grupos) {
  const doc = nuevoDoc('a4');
  for (let i = 0; i < grupos.length; i++) {
    if (i) doc.addPage();
    await paginaTransportista(doc, op, grupos[i].t, grupos[i].viajes);
  }
  piePaginas(doc, op);
  return blob(doc);
}


/** Lista de unidades de un transportista. */
export async function pdfUnidades(op, t, unidades) {
  const doc = nuevoDoc('a4');
  const y = await encabezado(doc, op, `LISTA DE UNIDADES — ${op.nave} / ORDEN ${op.orden}`);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('EMPRESA DE TRANSPORTE:', 10, y);
  doc.setFont('helvetica', 'normal'); doc.text(`${t.razon_social} · RUC ${t.ruc}`, 10 + doc.getTextWidth('EMPRESA DE TRANSPORTE: '), y);
  doc.autoTable({
    startY: y + 4,
    head: [COLS_UNIDADES.map((c) => c[0])],
    body: unidades.map((u) => COLS_UNIDADES.map(([, k]) => u[k] ?? '')),
    foot: [[`Total: ${unidades.length} unidades`, '', '', '', '', '', '', '']],
    styles: { fontSize: 8, cellPadding: 1.2, lineColor: [200, 200, 200], lineWidth: 0.1 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [235, 240, 246], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 10, right: 10, bottom: 14 }, showFoot: 'lastPage',
  });
  piePaginas(doc, op);
  return blob(doc);
}

/** RESUMEN ANUAL: cuadro de naves y el cuadro de transportistas de cada nave. */
export async function pdfResumenAnual(anio, ops, empresa, { soloTabla = false } = {}) {
  const doc = nuevoDoc('a4');
  const op = { empresa: empresa || 'PACIFICO DESPACHOS S.A.C.', nave: `Resumen ${anio}`, orden: '-' };
  let y = await encabezado(doc, op, `RESUMEN DE OPERACIONES ACOPIO DE SAL CHANCAY ${anio}`);
  const tn = ops.reduce((s, o) => s + o.tot.tn_acopio, 0);
  doc.autoTable({
    startY: y,
    head: [['N°', 'NAVE', 'FECHA INICIO ACOPIO', 'FECHA FINAL ACOPIO', 'TN SAL ACOPIADA']],
    body: ops.map((o, i) => [i + 1, o.nave, fecha(o.resumen?.inicio_acopio), fecha(o.resumen?.fin_acopio), n2(o.tot.tn_acopio)]),
    foot: [['', 'TOTAL', '', '', n2(tn)]],
    styles: { fontSize: 10, cellPadding: 1.8 }, headStyles: { fillColor: AZUL, textColor: 255, halign: 'center' },
    footStyles: { fillColor: [235, 240, 246], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center', cellWidth: 14 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' } },
    margin: { left: 30, right: 30, bottom: 14 },
  });
  if (soloTabla) { piePaginas(doc, op); return blob(doc); }
  for (const o of ops) {
    doc.addPage();
    y = await encabezado(doc, op, `${o.nave} · ORDEN ${o.orden}`);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Acopio: ${fecha(o.resumen?.inicio_acopio) || '—'} al ${fecha(o.resumen?.fin_acopio) || '—'} · TN sal acopiada: ${n2(o.tot.tn_acopio)} · Viajes: ${o.tot.viajes}`, 10, y);
    const s = (k) => o.filas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    doc.autoTable({
      startY: y + 4,
      head: [COLS_RESUMEN_T.map((c) => c[0])],
      body: o.filas.map((r) => COLS_RESUMEN_T.map(([, k, , t]) => (t === 'n' ? n2(r[k] || 0) : String(r[k] ?? (k === 'observacion' ? '' : 0))))),
      foot: [['TOTAL', String(o.filas.filter((x) => x.ruc).length), String(s('unidades_solicitadas')), '-', String(s('viajes_aprox')), String(s('tn_aprox')), String(s('viajes_realizados')), n2(s('tn_huacho')), n2(s('tn_cspcp')), '']],
      styles: { fontSize: 7.5, cellPadding: 1.1 }, headStyles: { fillColor: AZUL, textColor: 255, halign: 'center', valign: 'middle' },
      footStyles: { fillColor: [235, 240, 246], textColor: 0, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(COLS_RESUMEN_T.map(([, , , t], i) => [i, { halign: t ? 'right' : 'left' }])),
      margin: { left: 10, right: 10, bottom: 14 },
    });
  }
  piePaginas(doc, op);
  return blob(doc);
}

/** REPORTES de avance por cortes (matriz como la hoja REPORTES). Se parte en bloques de 6 reportes por página. */
export async function pdfCortes(op, proceso, cortes, ordinal) {
  const doc = nuevoDoc('a4');
  const P = proceso === 'despacho' ? 'DESPACHO' : 'ACOPIO';
  const fmt = (v, t) => (v == null || v === '' ? '' : t === 'dt' ? fh(v).slice(0, 16) : t === 'n' ? n2(v) : String(v));
  for (let i = 0; i < Math.max(1, cortes.length); i += 6) {
    if (i) doc.addPage();
    const y = await encabezado(doc, op, `PROCESO DE ${P} — ${op.nave} / ORDEN ${op.orden}`);
    const bloque = cortes.slice(i, i + 6);
    doc.autoTable({
      startY: y,
      head: [[`PROCESO DE ${P}`, ...bloque.map((r) => `${ordinal(r.numero)} REPORTE`)]],
      body: FILAS_CORTE.map(([l, f, t]) => [l, ...bloque.map((r) => fmt(f(r), t))]),
      styles: { fontSize: 8.5, cellPadding: 1.5, halign: 'center', lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold', fillColor: [238, 242, 247], cellWidth: 38 } },
      didParseCell: (d) => { if (d.section === 'body' && ['TN PARCIAL', 'TN TOTAL', 'TN RESTANTES', 'FCH. EST. TERM.'].includes(d.row.raw[0]) && d.column.index > 0) d.cell.styles.fontStyle = 'bold'; },
      margin: { left: 10, right: 10, bottom: 14 },
    });
  }
  piePaginas(doc, op);
  return blob(doc);
}
