import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../src/lib/csv.ts';

test('formula-injection prefixes are neutralised', () => {
  for (const bad of ['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\t=1', '\r=1'])
    assert.ok(csvCell(bad).startsWith('"\''), bad);
});
test('quotes, commas, newlines and null are handled', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('x,y\nz'), '"x,y\nz"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(1234), '"1234"');
});
test('toCsv builds header + rows and neutralises every cell', () => {
  const out = toCsv(['name', 'note'], [['Asha', '=HYPERLINK("http://x")'], ['Bo', 'ok']]);
  const lines = out.split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes('"\'=HYPERLINK'));
});
