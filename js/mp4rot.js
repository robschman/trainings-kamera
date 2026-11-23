// Drehung einer fertigen Szene lesen und ändern.
// Sie steht im Kopf der Videospur (tkhd-Matrix) der MP4-Datei. Das Video selbst wird nicht neu berechnet –
// es ändern sich nur ein paar Bytes, und jeder Player zeigt die Szene danach gedreht.

// Stelle der 36 Bytes großen Matrix in der Datei (oder -1)
function matrixAt(buf) {
  const dv = new DataView(buf);
  // Kästen einer Ebene durchgehen: [Größe 4][Name 4][Inhalt …]
  const find = (start, end, name) => {
    for (let p = start; p + 8 <= end;) {
      let size = dv.getUint32(p), head = 8;
      const type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); head = 16; }
      else if (size === 0) size = end - p;
      if (size < head || p + size > end) return null;
      if (type === name) return { start: p + head, end: p + size };
      p += size;
    }
    return null;
  };
  const moov = find(0, dv.byteLength, 'moov');
  const trak = moov && find(moov.start, moov.end, 'trak');
  const tkhd = trak && find(trak.start, trak.end, 'tkhd');
  if (!tkhd) return -1;
  const version = dv.getUint8(tkhd.start);
  const at = tkhd.start + 4 + (version ? 32 : 20) + 16;   // Zeiten, Spur-Nummer und Dauer überspringen
  return at + 36 <= tkhd.end ? at : -1;
}

// Drehung im Uhrzeigersinn: 0, 90, 180 oder 270 Grad
export function mp4Rotation(buf) {
  const at = matrixAt(buf);
  if (at < 0) return 0;
  const dv = new DataView(buf);
  const cos = dv.getInt32(at) / 65536, sin = dv.getInt32(at + 4) / 65536;
  return (Math.round(Math.atan2(sin, cos) / (Math.PI / 2)) * 90 + 360) % 360;
}

// Schreibt die Drehung direkt in buf. Liefert false, wenn die Datei anders aufgebaut ist als erwartet.
export function setMp4Rotation(buf, deg) {
  const at = matrixAt(buf);
  if (at < 0) return false;
  const dv = new DataView(buf);
  const t = deg * Math.PI / 180, cos = Math.round(Math.cos(t)) * 65536, sin = Math.round(Math.sin(t)) * 65536;
  dv.setInt32(at, cos); dv.setInt32(at + 4, sin);
  dv.setInt32(at + 12, -sin); dv.setInt32(at + 16, cos);
  return true;
}
