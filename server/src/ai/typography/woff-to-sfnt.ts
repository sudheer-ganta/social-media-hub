import zlib from 'zlib';

/**
 * Converts a WOFF1 buffer to a valid sfnt (TTF/OTF) buffer — pure Node, no
 * dependency. Needed because our font-file source (fontsource, mirroring
 * Google Fonts) ships static per-weight instances only as WOFF/WOFF2, while
 * the renderer (`@resvg/resvg-js`'s bundled fontdb) only loads raw sfnt: it
 * reports "malformed font" for both WOFF1 and WOFF2. WOFF1 is a thin,
 * documented wrapper (a table directory plus per-table zlib-deflate), so
 * unwrapping it ourselves avoids adding a native WOFF2-decoder dependency for
 * what is a one-time, build-time conversion (see scripts/fetch-fonts.ts) —
 * this never runs on the request path.
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') {
    throw new Error('woffToSfnt: input is not a WOFF1 file (bad magic)');
  }
  const flavor = woff.readUInt32BE(4); // 0x00010000 for TTF, 'OTTO' (as u32) for CFF/OTF
  const numTables = woff.readUInt16BE(12);

  const tables: Array<{ tag: string; data: Buffer; checksum: number }> = [];
  let off = 44;
  for (let i = 0; i < numTables; i++) {
    const tag = woff.toString('ascii', off, off + 4);
    const tableOffset = woff.readUInt32BE(off + 4);
    const compLength = woff.readUInt32BE(off + 8);
    const origLength = woff.readUInt32BE(off + 12);
    const origChecksum = woff.readUInt32BE(off + 16);
    const compressed = woff.subarray(tableOffset, tableOffset + compLength);
    const data = compLength < origLength ? zlib.inflateSync(compressed) : Buffer.from(compressed);
    if (data.length !== origLength) {
      throw new Error(`woffToSfnt: table "${tag}" decompressed to ${data.length} bytes, expected ${origLength}`);
    }
    tables.push({ tag, data, checksum: origChecksum });
    off += 20;
  }

  // sfnt table directories must be sorted by tag (ascending) for a well-formed font.
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  const padded = tables.map((t) => {
    const pad = (4 - (t.data.length % 4)) % 4;
    return { ...t, pad };
  });
  const bodySize = padded.reduce((sum, t) => sum + t.data.length + t.pad, 0);

  const out = Buffer.alloc(headerSize + bodySize);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);

  let dirOff = 12;
  let dataOff = headerSize;
  for (const t of padded) {
    out.write(t.tag, dirOff, 'ascii');
    out.writeUInt32BE(t.checksum, dirOff + 4);
    out.writeUInt32BE(dataOff, dirOff + 8);
    out.writeUInt32BE(t.data.length, dirOff + 12);
    t.data.copy(out, dataOff);
    dataOff += t.data.length + t.pad;
    dirOff += 16;
  }
  return out;
}
