// BOCU1 codec — Unicode Business Object for Compression Using Unicode.
//
// The format is a byte-oriented transform of UTF-32 code points. Each code point is
// encoded as a single byte when it lies in the same 0x100 block as the previous code
// point; otherwise it falls back to a multi-byte escape. This mirrors the reference
// BOCU-1 design but is deliberately simplified: we keep only the single-byte fast path
// and a fixed-width three-byte escape for everything else. The trade-off is that we
// lose the compact two- and four-byte forms for mid-range code points in exchange for
// a decoder that is trivial to reason about and cannot desynchronise.
//
// We chose this because the awkward part of BOCU-1 is not the arithmetic, it is the
// state machine. A partial implementation that gets the state transitions wrong
// produces silent corruption. A smaller, fully-specified subset is more useful than a
// larger one that is almost right.
//
// Wire format:
//   0x00..0xFB  single byte, code point = (previousBlock << 8) | byte
//   0xFC        escape, followed by three big-endian bytes holding the full code point
//   0xFD..0xFF  reserved; decoding them raises BOCU1Error
//
// The previousBlock is the high 24 bits of the previously decoded/encoded code point,
// i.e. codePoint >>> 8. It starts at zero. After every code point (single or escaped)
// it is updated to the new code point >>> 8.

const ESCAPE = 0xfc;
const RESERVED_START = 0xfd;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

export class BOCU1Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'BOCU1Error';
  }
}

function assertValidCodePoint(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    throw new BOCU1Error(`code point out of range: ${codePoint}`);
  }
  if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) {
    // Isolated surrogates are not scalar values. Rejecting them keeps the round-trip
    // property honest: a JavaScript string may contain them, but a Unicode scalar
    // stream may not.
    throw new BOCU1Error(`surrogate code point not allowed: ${codePoint}`);
  }
}

// Encode a JavaScript string into a Uint8Array of BOCU-1 bytes.
//
// We iterate by code point (not by UTF-16 code unit) so that astral characters are
// handled as a single unit. Strings containing lone surrogates are rejected rather
// than silently replaced.
export function encode(input) {
  if (typeof input !== 'string') {
    throw new BOCU1Error('encode expects a string');
  }

  const out = [];
  let previousBlock = 0;

  for (const ch of input) {
    const codePoint = ch.codePointAt(0);
    assertValidCodePoint(codePoint);

    const block = codePoint >>> 8;
    if (block === previousBlock && (codePoint & 0xff) < ESCAPE) {
      out.push(codePoint & 0xff);
    } else {
      out.push(ESCAPE);
      out.push((codePoint >>> 16) & 0xff);
      out.push((codePoint >>> 8) & 0xff);
      out.push(codePoint & 0xff);
    }
    previousBlock = block;
  }

  return Uint8Array.from(out);
}

// Decode a Uint8Array (or ArrayBuffer view) of BOCU-1 bytes back into a string.
//
// We accumulate code points and then build the string with String.fromCodePoint so
// that astral characters come out as proper surrogate pairs rather than being split.
export function decode(bytes) {
  if (bytes instanceof ArrayBuffer) {
    bytes = new Uint8Array(bytes);
  }
  if (!ArrayBuffer.isView(bytes)) {
    throw new BOCU1Error('decode expects a Uint8Array or ArrayBuffer');
  }
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const codePoints = [];
  let previousBlock = 0;
  let i = 0;

  while (i < view.length) {
    const b = view[i];
    if (b < ESCAPE) {
      codePoints.push((previousBlock << 8) | b);
      previousBlock = (previousBlock << 8 | b) >>> 8;
      i += 1;
    } else if (b === ESCAPE) {
      if (i + 3 >= view.length) {
        throw new BOCU1Error('truncated escape sequence at end of input');
      }
      const codePoint = (view[i + 1] << 16) | (view[i + 2] << 8) | view[i + 3];
      assertValidCodePoint(codePoint);
      codePoints.push(codePoint);
      previousBlock = codePoint >>> 8;
      i += 4;
    } else {
      throw new BOCU1Error(`reserved byte 0x${b.toString(16)} at offset ${i}`);
    }
  }

  return String.fromCodePoint(...codePoints);
}
