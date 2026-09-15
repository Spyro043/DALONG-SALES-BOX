const fs = require('fs');
const path = require('path');
const sharp = require(process.env.DSB_SHARP_PATH || 'sharp');
async function main() {
  const dir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="48" fill="#1479c9"/><text x="128" y="158" text-anchor="middle" font-family="Arial" font-weight="700" font-size="91" fill="white">DSB</text></svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'dsb.png'), png);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(dir, 'dsb.ico'), Buffer.concat([header, png]));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
