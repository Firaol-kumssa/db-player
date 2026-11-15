// Unit tests for the Level 2 API's caption validator. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVTT } from '../api/server.mjs';

test('accepts the generated Amharic captions', () => {
  const cues = parseVTT(readFileSync(new URL('../media/lesson.am.vtt', import.meta.url), 'utf8'));
  assert.ok(cues.length >= 8);
});
test('rejects files without the WEBVTT header, with a message in words', () => {
  assert.throws(() => parseVTT('hello'), /must start with the line "WEBVTT"/);
});
test('rejects bad and backwards times', () => {
  assert.throws(() => parseVTT('WEBVTT\n\n00:00:5 --> 00:00:06.000\nx'), /not in the form/);
  assert.throws(() => parseVTT('WEBVTT\n\n00:00:05.000 --> 00:00:02.000\nx'), /end time must be after/);
});
test('rejects empty cues and empty files', () => {
  assert.throws(() => parseVTT('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n'), /has no text/);
  assert.throws(() => parseVTT('WEBVTT\n'), /no captions/);
});
test('skips NOTE blocks and accepts cue ids and settings', () => {
  const c = parseVTT('WEBVTT\n\nNOTE made by hand\n\nc1\n00:01.000 --> 00:02.000 line:0\n<b>Hi</b>');
  assert.deepEqual(c, [{ start: 1, end: 2, text: 'Hi' }]);
});
