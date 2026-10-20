const zlib = require('node:zlib');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const data = Buffer.concat([Buffer.from(name), bytes]);
  const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(data));
  return Buffer.concat([size, data, checksum]);
}
function redImage() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 2;
  const rows = [];
  for (let y = 0; y < 64; y++) {
    const row = Buffer.alloc(1 + 64 * 3);
    for (let x = 0; x < 64; x++) row[1 + x * 3] = 255;
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
module.exports = { redImage };
