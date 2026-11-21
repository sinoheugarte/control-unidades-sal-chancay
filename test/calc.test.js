
import test from 'node:test';
import assert from 'node:assert';
import * as C from '../web/js/calc.js';

const op = { tn_programadas: 100, params: '{}' };
const base = (o) => ({ transportista_id: 1, transportista_nombre: 'T1', fecha_despacho: '2026-10-20', ...o });

test('normaliza placas como la macro LimpiarPlacas', () => {
  assert.strictEqual(C.normPlaca(' akc-731 '), 'AKC731');
  assert.strictEqual(C.normPlaca('AKC 731'), 'AKC731');
});

test('jornada por hora del día', () => {
  assert.strictEqual(C.jornadaDe('2026-10-20 07:00'), '07:00 - 16:00');
  assert.strictEqual(C.jornadaDe('2026-10-20 16:30'), '16:00 - 23:00');
  assert.strictEqual(C.jornadaDe('2026-10-20 23:10'), '23:00 - 07:00');
  assert.strictEqual(C.jornadaDe('2026-10-21 03:00'), '23:00 - 07:00');
});

test('turno 23:00 - 07:00 se reporta al día siguiente', () => {
  assert.deepStrictEqual(C.turnoDe('2026-10-20 23:15:00'), { fecha: '2026-10-21', jornada: '23:00 - 07:00' });
  assert.deepStrictEqual(C.turnoDe('2026-10-21 02:00:00'), { fecha: '2026-10-21', jornada: '23:00 - 07:00' });
  assert.deepStrictEqual(C.turnoDe('2026-10-21 22:59:00'), { fecha: '2026-10-21', jornada: '16:00 - 23:00' });
});

test('columnas calculadas de DETALLE TRANSPORTE', () => {
  const vs = C.enriquecerViajes([
    base({ id: 1, placa: 'A1', peso_origen: 40, ticket: 'X1', peso_destino: 40.1, ingreso_en: '2026-10-20 18:00:00', salida_en: '2026-10-20 18:25:00', despacho_en: '2026-10-20 10:00' }),
    base({ id: 2, placa: 'A1', peso_origen: 35, ticket: null, despacho_en: '2026-10-20 14:00' }),
    base({ id: 3, placa: 'B2', peso_origen: 20, ticket: '-', peso_destino: 20, despacho_en: '2026-10-20 12:00' }),
  ], op, [{ tipo: 'despacho', numero: 1, inicio: '2026-10-20 08:00', fin: '2026-10-20 13:00' }]);
  const [a, b, c] = vs;
  assert.deepStrictEqual([a.nro, a.vuelta, a.status, a.diferencia, a.rango, a.tiempo_min, a.rep_despacho_calc], [1, 1, 'DESCARGADO', 0.1, '<=30 MIN', 25, 1]);
  assert.strictEqual(b.placa, 'A1'); // orden de registro, como las filas del Excel
  assert.deepStrictEqual([b.vuelta, b.status, b.peso_destino_calc, b.rep_despacho_calc], [2, 'FALTA DESCARGAR', 35, null]);
  assert.deepStrictEqual([c.status, c.tipo, c.redondeo], ['TN DEVUELTAS', 'TN DEVUELTAS', 30]);
  assert.strictEqual(c.acumulado, 95.1);
  assert.strictEqual(c.restante, 4.9);
  const t = C.totales(vs, op, null);
  assert.deepStrictEqual([t.tn_acopio, t.tn_transito, t.tn_devueltas, t.viajes_pendientes], [40.1, 35, 20, 1]);
});

test('reportes por turno y estimación de término', () => {
  const vs = C.enriquecerViajes([
    base({ id: 1, placa: 'A', peso_origen: 25, despacho_en: '2026-10-20 09:00' }),
    base({ id: 2, placa: 'B', peso_origen: 25, despacho_en: '2026-10-20 10:00' }),
  ], op, []);
  const reps = [{ id: 1, tipo: 'despacho', numero: 1, inicio: '2026-10-20 08:00', fin: '2026-10-20 12:00' }];
  const [r] = C.tablaReportes(C.enriquecerViajes(vs, op, reps), op, reps, 'despacho');
  assert.deepStrictEqual([r.tn_parcial, r.viajes, r.horas, r.tn_restantes, r.viajes_est_rest, r.horas_est_rest, r.fecha_est_termino],
    [50, 2, 4, 50, 2, 4, '2026-10-20 16:00']);
});

test('planificación PREACOPIO', () => {
  const p = C.preacopio({ tn_programadas: 20060, params: JSON.stringify({ tn_x_unidad: 36, viajes_x_hora: 8, jornadas_x_dia: 3, inicio_acopio: '2026-10-20 11:00' }) });
  assert.strictEqual(p.acopio.viajes_total, 558);
  assert.strictEqual(p.acopio.horas, 69.75);
  assert.strictEqual(p.acopio.termino, '2026-10-23 08:45');
  assert.strictEqual(p.unidades_min, 24);
  assert.strictEqual(p.unidades_necesarias, 36);
});

test('planificación por vueltas (hoja TRANSPORTISTAS)', () => {
  const p = C.vueltasPlan({ unidades_solicitadas: 40, tn_prom_unidad: 33, vueltas_manual: { 11: 13240 } });
  assert.deepStrictEqual(p.vueltas.slice(0, 3).map((v) => v.tn), [1320, 2640, 3960]);
  assert.strictEqual(p.vueltas[9].tn, 13200);
  assert.deepStrictEqual(p.vueltas[10], { tn: 13240, manual: true });
  assert.strictEqual(p.vueltas[11].tn, null);
  assert.strictEqual(p.total, 13240);
});

test('planVueltas: última vuelta como el Excel (más unidades primero, saldo al mayor que no cupo)', () => {
  const ps = [[1, 40], [2, 8], [3, 10], [4, 2], [5, 2]].map(([id, u]) => ({ transportista_id: id, unidades_solicitadas: u, tn_prom_unidad: 33 }));
  const m = C.planVueltas(ps, 20060);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((i) => m.get(i).vueltas[9].tn), [13200, 2640, 3032, 594, 594]);
  assert.strictEqual([...m.values()].reduce((s, x) => s + x.total, 0), 20060);
  assert.strictEqual(m.get(1).vueltas[10].tn, null);
});
