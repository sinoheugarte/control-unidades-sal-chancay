import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

test('todas las importaciones locales llevan la versión para evitar caché', () => {
  for (const f of readdirSync('web/js').filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(`web/js/${f}`, 'utf8');
    for (const m of src.matchAll(/from '(\.\/[^']+)'/g)) assert.match(m[1], /\?v=__V__$/, `${f}: ${m[1]}`);
  }
});
