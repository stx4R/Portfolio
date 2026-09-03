// card.glb 텍스처 압축기
// ㄴ 2.2MB PNG 한 장이 GLB 용량 전부. 지오메트리는 150KB뿐
// ㄴ 무손실 WebP로 다시 감음. 픽셀 그대로라 렌더 결과 동일
// ㄴ 실행: node tools/optimize-card-glb.mjs  (npm i sharp 필요)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'static', 'card.glb');
const OUT = path.join(ROOT, 'static', 'card.glb');

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const pad4 = n => (4 - (n % 4)) % 4;

function readGLB(buf) {
  const total = buf.readUInt32LE(8);
  let off = 12, json = null, bin = Buffer.alloc(0);
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    else if (type === BIN_CHUNK) bin = data;
    off += 8 + len + pad4(len);
  }
  return { json, bin };
}

function writeGLB(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length), 0x20)]);
  const bn = Buffer.concat([bin, Buffer.alloc(pad4(bin.length), 0)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(JSON_CHUNK, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bn.length, 0); bh.writeUInt32LE(BIN_CHUNK, 4);
  return Buffer.concat([header, jh, js, bh, bn]);
}

const before = fs.readFileSync(SRC);
const { json, bin } = readGLB(before);

// 이미지별 새 바이트 준비
const replacement = new Map();
for (const [i, im] of (json.images || []).entries()) {
  if (im.bufferView == null) continue;
  const bv = json.bufferViews[im.bufferView];
  const cur = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const webp = await sharp(cur).webp({ lossless: true, effort: 6 }).toBuffer();
  console.log(`image[${i}] ${im.mimeType} ${(cur.length / 1024).toFixed(0)}KB -> webp ${(webp.length / 1024).toFixed(0)}KB`);
  replacement.set(im.bufferView, webp);
  im.mimeType = 'image/webp';
}

// bufferView 전부 새 BIN으로 재배치
const chunks = [];
let cursor = 0;
json.bufferViews.forEach((bv, i) => {
  const data = replacement.get(i) ?? bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const padding = pad4(cursor);
  if (padding) { chunks.push(Buffer.alloc(padding, 0)); cursor += padding; }
  bv.byteOffset = cursor;
  bv.byteLength = data.length;
  chunks.push(data);
  cursor += data.length;
});
const newBin = Buffer.concat(chunks);
json.buffers[0].byteLength = newBin.length;
delete json.buffers[0].uri;

// EXT_texture_webp 로 텍스처 소스 연결
for (const tex of json.textures || []) {
  if (tex.source == null) continue;
  tex.extensions = { ...(tex.extensions || {}), EXT_texture_webp: { source: tex.source } };
  delete tex.source;
}
const add = (key, name) => {
  json[key] = [...new Set([...(json[key] || []), name])];
};
add('extensionsUsed', 'EXT_texture_webp');
add('extensionsRequired', 'EXT_texture_webp');

const after = writeGLB(json, newBin);
fs.writeFileSync(OUT, after);
console.log(`\ncard.glb ${(before.length / 1048576).toFixed(2)}MB -> ${(after.length / 1048576).toFixed(2)}MB`);
