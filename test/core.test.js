import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, BOCU1Error } from '../src/index.js';

test('empty string round-trips to empty bytes', () => {
  assert.deepEqual(encode(''), new Uint8Array([]));
  assert.equal(decode(new Uint8Array([])), '');
});

test('ASCII within the first block uses single bytes', () => {
  const bytes = encode('ABC');
  assert.deepEqual(bytes, new Uint8Array([0x41, 0x42, 0x43]));
  assert.equal(decode(bytes), 'ABC');
});

test('a code point outside the previous block triggers an escape', () => {
  // U+0100 has block 1, previous block starts at 0, so it must escape.
  const bytes = encode('\u0100');
  assert.deepEqual(bytes, new Uint8Array([0xfc, 0x00, 0x01, 0x00]));
  assert.equal(decode(bytes), '\u0100');
});

test('subsequent code points in the same block stay single byte', () => {
  // U+0100 escapes to block 1, then U+0101 is a single byte. U+01ff has low
  // byte 0xff, which is reserved, so it must escape again.
  const bytes = encode('\u0100\u0101\u01ff');
  assert.deepEqual(bytes, new Uint8Array([0xfc, 0x00, 0x01, 0x00, 0x01, 0xfc, 0x00, 0x01, 0xff]));
  assert.equal(decode(bytes), '\u0100\u0101\u01ff');
});

test('astral code points round-trip', () => {
  const s = '\u{1F600}';
  const bytes = encode(s);
  assert.equal(decode(bytes), s);
});

test('mixed ASCII, BMP, and astral round-trip', () => {
  const s = 'a\u00e9\u0100\u{1F4A9}z';
  assert.equal(decode(encode(s)), s);
});

test('reserved byte 0xfd is rejected', () => {
  assert.throws(() => decode(new Uint8Array([0xfd])), BOCU1Error);
});

test('truncated escape is rejected', () => {
  assert.throws(() => decode(new Uint8Array([0xfc, 0x00, 0x01])), BOCU1Error);
});

test('surrogate code points are rejected on encode', () => {
  assert.throws(() => encode('\ud800'), BOCU1Error);
});

test('surrogate code points are rejected on decode', () => {
  assert.throws(() => decode(new Uint8Array([0xfc, 0x00, 0xd8, 0x00])), BOCU1Error);
});

test('encode rejects non-string input', () => {
  assert.throws(() => encode(42), BOCU1Error);
});

test('decode accepts an ArrayBuffer', () => {
  const bytes = encode('hi');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  assert.equal(decode(buffer), 'hi');
});

test('decode rejects non-buffer input', () => {
  assert.throws(() => decode('not bytes'), BOCU1Error);
});
