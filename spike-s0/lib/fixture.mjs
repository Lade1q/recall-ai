// Nạp fixture concept đã duyệt (chép tay CHỈ cho spike; production sinh qua extract_concepts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  here,
  '..',
  '..',
  'docs',
  'management',
  'sprint-plans',
  's0-fixture-ipv4-classful.json',
);

export function loadFixture() {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  if (!fx.checkpoints?.length) throw new Error('Fixture không có checkpoints');
  return fx;
}

export function probeById(fixture, id) {
  const p = (fixture.probes || []).find((x) => x.id === id);
  if (!p) throw new Error(`Fixture thiếu probe "${id}"`);
  return p;
}
