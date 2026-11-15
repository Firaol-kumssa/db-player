// Unit tests for db-player's pure logic. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let Defined;
globalThis.window = globalThis;
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => undefined, define: (_n, c) => { Defined = c; } };
globalThis.document = { currentScript: { src: 'http://localhost/module/db-player.js' } };
globalThis.location = { href: 'http://localhost/', origin: 'http://localhost' };
new Function(readFileSync(new URL('../module/db-player.js', import.meta.url), 'utf8'))();

const vtt = readFileSync(new URL('../media/lesson.am.vtt', import.meta.url), 'utf8');

test('parses the generated Amharic captions', () => {
  const cues = Defined.parseVTT(vtt);
  assert.ok(cues.length >= 8);
  assert.equal(cues[0].text, '[ለስላሳ ሙዚቃ]');
  cues.forEach((c) => assert.ok(c.end > c.start));
});

test('cues are in order and never overlap', () => {
  const cues = Defined.parseVTT(vtt);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end - 0.001);
});

test('finds the cue at a time (transcript highlight / seek)', () => {
  const cues = Defined.parseVTT('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nA\n\n00:00:03.000 --> 00:00:04.000\n<b>B</b>');
  assert.equal(Defined.cueIndexAt(cues, 1.2), 0);
  assert.equal(Defined.cueIndexAt(cues, 2.7), -1);
  assert.equal(Defined.cueIndexAt(cues, 3.5), 1);
  assert.equal(cues[1].text, 'B');
});

test('formats time and reads caption language from file name', () => {
  assert.equal(Defined.fmt(65.9), '1:05');
  assert.equal(Defined.fmt(NaN), '0:00');
  assert.equal(Defined.langOf('/media/lesson.am.vtt'), 'am');
  assert.equal(Defined.langOf('lesson.en.vtt?v=2'), 'en');
});

test('Amharic and English language files have the same keys', () => {
  const am = JSON.parse(readFileSync(new URL('../module/i18n/am.json', import.meta.url)));
  const en = JSON.parse(readFileSync(new URL('../module/i18n/en.json', import.meta.url)));
  assert.deepEqual(Object.keys(am).sort(), Object.keys(en).sort());
  Object.entries(am).forEach(([k, v]) => assert.ok(String(v).length, `am.${k} is empty`));
});
