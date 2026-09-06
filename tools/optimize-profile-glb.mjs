// profile.glb(Meshy 원본) 감량기
// ㄴ 원본은 34MB / 193만 삼각형에 머티리얼도 UV도 없는 지오메트리 덩어리. 웹에 그냥 못 올림
// ㄴ 눈/입이 색 없이 요철로만 박혀 있어서, 돌출량으로 찾아내 COLOR_0 마스크에 구워둠
// ㄴ 마스크는 흰색=몸통 / 검정=눈,입. 실제 색은 index.html 셰이더에서 uniform으로 섞음
// ㄴ 실행: node tools/optimize-profile-glb.mjs <원본.glb>  (npm i @gltf-transform/core meshoptimizer 필요)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, 'static', 'profile.glb');
if (!SRC) {
  console.error('usage: node tools/optimize-profile-glb.mjs <source.glb> [out.glb]');
  process.exit(1);
}

const TARGET_TRIS = 16000;
const SMOOTH_ITERS = 12;    // 라플라시안 반복. 이 정도 돌려야 눈/입이 배경 곡률에서 떨어져 나옴
const SEED_QUANTILE = 0.985; // 앞면 중앙부 후보 중 상위 몇 %를 돌기 씨앗으로 볼지
const EYE_GROW = 0.034;     // 씨앗에서 XY로 얼마나 번질지 (모델 단위, 정규화 전)
const MOUTH_GROW = 0.020;   // 입은 선이라 얇게
const TARGET_HEIGHT = 1;    // 결과물 Y 높이를 1로 맞춤. index.html에서 픽셀 크기만 곱하면 됨

// ── 1. 원본 읽기 ─────────────────────────────────────────────
const io = new NodeIO();
const doc = await io.read(SRC);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
let P = Float32Array.from(prim.getAttribute('POSITION').getArray());
let I = Uint32Array.from(prim.getIndices().getArray());
console.log(`원본 : verts ${P.length / 3}  tris ${I.length / 3}  ${(fs.statSync(SRC).size / 1048576).toFixed(1)}MB`);

// ── 2. 정점 노멀 ─────────────────────────────────────────────
function vertexNormals(P, I) {
  const n = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k * 3] += nx; n[k * 3 + 1] += ny; n[k * 3 + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
const N0 = vertexNormals(P, I);
const VN = P.length / 3;

// ── 3. 돌출량 = 원본 - 라플라시안 평활, 노멀 방향 성분 ────────
let sm = Float64Array.from(P);
for (let k = 0; k < SMOOTH_ITERS; k++) {
  const acc = new Float64Array(P.length), cnt = new Uint32Array(VN);
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      acc[a * 3] += sm[b * 3]; acc[a * 3 + 1] += sm[b * 3 + 1]; acc[a * 3 + 2] += sm[b * 3 + 2]; cnt[a]++;
      acc[b * 3] += sm[a * 3]; acc[b * 3 + 1] += sm[a * 3 + 1]; acc[b * 3 + 2] += sm[a * 3 + 2]; cnt[b]++;
    }
  }
  const out = new Float64Array(P.length);
  for (let i = 0; i < VN; i++) {
    const c = cnt[i] || 1;
    out[i * 3] = acc[i * 3] / c; out[i * 3 + 1] = acc[i * 3 + 1] / c; out[i * 3 + 2] = acc[i * 3 + 2] / c;
  }
  sm = out;
}
const prot = new Float32Array(VN);
for (let i = 0; i < VN; i++) {
  prot[i] = (P[i * 3] - sm[i * 3]) * N0[i * 3]
          + (P[i * 3 + 1] - sm[i * 3 + 1]) * N0[i * 3 + 1]
          + (P[i * 3 + 2] - sm[i * 3 + 2]) * N0[i * 3 + 2];
}

// ── 4. 앞면 중앙부에서 돌기 씨앗 뽑기 ────────────────────────
const cand = [];
for (let i = 0; i < VN; i++) {
  if (N0[i * 3 + 2] < 0.55 || P[i * 3 + 2] < 0.1) continue;
  if (Math.abs(P[i * 3]) > 0.45 || Math.abs(P[i * 3 + 1]) > 0.45) continue;
  cand.push(i);
}
const cs = cand.map(i => prot[i]).sort((a, b) => a - b);
const TH = cs[Math.floor(SEED_QUANTILE * (cs.length - 1))];
const seeds = cand.filter(i => prot[i] > TH);
console.log(`씨앗 : ${seeds.length}개 (앞면 후보 ${cand.length}개 중 상위 ${((1 - SEED_QUANTILE) * 100).toFixed(1)}%)`);

// ── 5. XY 근접으로 클러스터링 → 눈 2개 / 입 1개 ──────────────
const LINK = 0.03;
const parent = new Map(seeds.map(i => [i, i]));
const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const cell = new Map();
const key = (gx, gy) => gx * 100000 + gy;
for (const i of seeds) {
  const gx = Math.floor(P[i * 3] / LINK), gy = Math.floor(P[i * 3 + 1] / LINK);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const j of cell.get(key(gx + dx, gy + dy)) || []) {
      const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1]);
      if (d < LINK) { const a = find(i), b = find(j); if (a !== b) parent.set(a, b); }
    }
  }
  const k = key(gx, gy);
  if (!cell.has(k)) cell.set(k, []);
  cell.get(k).push(i);
}
const groups = new Map();
for (const i of seeds) {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(i);
}
let marks = [...groups.values()].filter(g => g.length >= 30);
marks.sort((a, b) => b.length - a.length);
marks = marks.slice(0, 3);
for (const g of marks) {
  const xs = g.map(i => P[i * 3]), ys = g.map(i => P[i * 3 + 1]);
  const cx = xs.reduce((s, v) => s + v, 0) / g.length;
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  g.isMouth = Math.abs(cx) < 0.06 && w > h * 1.4;
  console.log(`  덩어리 ${g.length}개  cx ${cx.toFixed(3)}  ${w.toFixed(3)}x${h.toFixed(3)}  ${g.isMouth ? '입' : '눈'}`);
}
if (marks.length !== 3) console.warn(`  ! 덩어리가 3개가 아님(${marks.length}). 임계값 확인 필요`);

// ── 6. 씨앗을 XY로 번지게 해서 마스크 만들기 ─────────────────
const mask = new Uint8Array(VN); // 1 = 눈/입
const buckets = new Map();
const BS = Math.max(EYE_GROW, MOUTH_GROW);
for (const g of marks) {
  const grow = g.isMouth ? MOUTH_GROW : EYE_GROW;
  for (const i of g) {
    const gx = Math.floor(P[i * 3] / BS), gy = Math.floor(P[i * 3 + 1] / BS);
    const k = key(gx, gy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push([P[i * 3], P[i * 3 + 1], grow * grow]);
  }
}
for (let i = 0; i < VN; i++) {
  if (N0[i * 3 + 2] < 0.2 || P[i * 3 + 2] < 0) continue;
  const x = P[i * 3], y = P[i * 3 + 1];
  const gx = Math.floor(x / BS), gy = Math.floor(y / BS);
  outer:
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const [sx, sy, r2] of buckets.get(key(gx + dx, gy + dy)) || []) {
      const ddx = x - sx, ddy = y - sy;
      if (ddx * ddx + ddy * ddy < r2) { mask[i] = 1; break outer; }
    }
  }
}
console.log(`마스크 : ${mask.reduce((s, v) => s + v, 0)}개 정점이 눈/입`);

// ── 7. 마스크를 속성으로 물고 감량 ───────────────────────────
// ㄴ simplifyWithAttributes 안 쓰면 눈 경계가 뭉개짐. 가중치 크게 줘서 경계 정점을 붙잡음
await MeshoptSimplifier.ready;
const attrs = new Float32Array(VN);
for (let i = 0; i < VN; i++) attrs[i] = mask[i];
const [newIdx] = MeshoptSimplifier.simplifyWithAttributes(
  I, P, 3, attrs, 1, [8], null, TARGET_TRIS * 3, 0.02, ['LockBorder']
);

// 쓰이는 정점만 남기고 재색인
const remap = new Int32Array(VN).fill(-1);
let next = 0;
for (const v of newIdx) if (remap[v] < 0) remap[v] = next++;
const P2 = new Float32Array(next * 3), M2 = new Float32Array(next * 3);
for (let i = 0; i < VN; i++) {
  const r = remap[i];
  if (r < 0) continue;
  P2[r * 3] = P[i * 3]; P2[r * 3 + 1] = P[i * 3 + 1]; P2[r * 3 + 2] = P[i * 3 + 2];
  const m = mask[i] ? 0 : 1; // 흰색 = 몸통
  M2[r * 3] = m; M2[r * 3 + 1] = m; M2[r * 3 + 2] = m;
}
const I2 = new Uint32Array(newIdx.length);
for (let i = 0; i < newIdx.length; i++) I2[i] = remap[newIdx[i]];

// ── 8. 원점 정렬 + 높이 1로 정규화 ───────────────────────────
let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
for (let i = 0; i < next; i++) {
  minX = Math.min(minX, P2[i * 3]); maxX = Math.max(maxX, P2[i * 3]);
  minY = Math.min(minY, P2[i * 3 + 1]); maxY = Math.max(maxY, P2[i * 3 + 1]);
  minZ = Math.min(minZ, P2[i * 3 + 2]); maxZ = Math.max(maxZ, P2[i * 3 + 2]);
}
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
const s = TARGET_HEIGHT / (maxY - minY);
for (let i = 0; i < next; i++) {
  P2[i * 3] = (P2[i * 3] - cx) * s;
  P2[i * 3 + 1] = (P2[i * 3 + 1] - cy) * s;
  P2[i * 3 + 2] = (P2[i * 3 + 2] - cz) * s;
}
const N2 = vertexNormals(P2, I2);

// ── 9. 새 문서로 저장 ────────────────────────────────────────
const out = new (await import('@gltf-transform/core')).Document();
const buf = out.createBuffer();
const outPrim = out.createPrimitive()
  .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(P2).setBuffer(buf))
  .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(N2).setBuffer(buf))
  .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(M2).setBuffer(buf))
  .setIndices(out.createAccessor().setType('SCALAR').setArray(I2).setBuffer(buf));
const node = out.createNode('star').setMesh(out.createMesh('star').addPrimitive(outPrim));
out.createScene('scene').addChild(node);
await io.write(OUT, out);

console.log(`\nprofile.glb : verts ${next}  tris ${I2.length / 3}  ${(fs.statSync(OUT).size / 1048576).toFixed(2)}MB`);
console.log(`크기 ${((maxX - minX) * s).toFixed(3)} x ${((maxY - minY) * s).toFixed(3)} x ${((maxZ - minZ) * s).toFixed(3)}`);
