# bocu1-string-codec

Encodes and decodes strings using the Unicode Business Object for Compression Using Unicode.

```js
import { encode, decode } from './src/index.js';

const bytes = encode('Hello \u0100\u{1F600}');
// Uint8Array( ... )
const text = decode(bytes);
// 'Hello \u0100\u{1F600}'
```

## Why this exists

BOCU-1 is a stateful, byte-oriented transform of Unicode code points. The reference design packs code points into one, two, three, or four bytes depending on how close they are to the previously encoded code point. That compactness is the point, but it also means a decoder has to track a running block and a running delta, and a single wrong transition corrupts every subsequent byte.

This library implements a deliberately smaller subset: a single-byte fast path for code points that share the high 24 bits of the previous code point, and a fixed four-byte escape (`0xFC` followed by three big-endian bytes) for everything else. The trade-off is size: mid-range code points that the full format would pack into two bytes cost four here. In exchange the state machine is small enough to verify by inspection, and the decoder cannot silently desynchronise.

## The awkward edge

Bytes `0xFD`, `0xFE`, and `0xFF` are reserved and never produced by `encode`. `decode` rejects them with a `BOCU1Error`, as it does for truncated escapes and for isolated surrogate code points. A JavaScript string can contain lone surrogates; a Unicode scalar stream cannot, so encoding one is an error rather than a silent replacement. The same applies when decoding an escape whose payload names a surrogate.

## API

- `encode(input: string): Uint8Array`
- `decode(bytes: Uint8Array | ArrayBuffer): string`
- `BOCU1Error` — thrown for invalid input, reserved bytes, truncated escapes, and surrogates.
