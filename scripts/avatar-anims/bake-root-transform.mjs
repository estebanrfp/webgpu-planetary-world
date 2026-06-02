/**
 * Bake the armature-root transform into the bone animation tracks of
 * assets/character/avatar-anims.glb (run AFTER build-anims.py — see README.md).
 *
 * Why: Blender's glTF export leaves the cm→m scale + Z-up→Y-up rotation on a
 * parent "Armature" node. The engine's animation FK starts at the root joint
 * (Hips) and ignores that parent node, so without this bake the skeleton renders
 * in cm / wrong axis and the avatar explodes off-screen. This folds the parent
 * transform into the bone tracks so the clips are pure Y-up/metres.
 *
 *  - Every bone's local translation is in cm → scale all by 0.01. The Hips (root
 *    joint, directly under the armature) also gets the Z-up→Y-up rotation.
 *  - Bone scale is left ~1 (scaling it would shrink the whole skeleton 100×).
 *  - Only the Hips rotation needs rebasing; child rotations are already correct.
 *  - glTF dedupes identical keyframe accessors (incl. the bind "Layer0" anim), so
 *    each output accessor is baked only ONCE.
 *
 * Run: node scripts/avatar-anims/bake-root-transform.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../../assets/character/avatar-anims.glb', import.meta.url);

// ── parse GLB ────────────────────────────────────────────────────────────────
const buf = readFileSync(PATH);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binChunkStart = 20 + jsonLen;            // +8 chunk header
const binLen = buf.readUInt32LE(binChunkStart);
const bin = Buffer.from(buf.subarray(binChunkStart + 8, binChunkStart + 8 + binLen));
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

const skin = json.skins[0];
const hips = skin.joints[0];                    // root joint
const parent = json.nodes.findIndex((n) => n.children?.includes(hips)); // armature

// Root transform to bake: R(qA) · S(scale). (translation assumed 0)
const pNode = json.nodes[parent];
const qA = pNode.rotation || [0, 0, 0, 1];
const sc = (pNode.scale || [1, 1, 1])[0];

// quaternion multiply qA * q
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
// rotate vec3 v by quaternion q
const qrot = (q, v) => {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
};

const accOffset = (acc) => (json.bufferViews[acc.bufferView].byteOffset || 0) + (acc.byteOffset || 0);

const done = new Set();
let patched = 0;
for (const anim of json.animations || []) {
  for (const ch of anim.channels) {
    const path = ch.target.path;
    const isHips = ch.target.node === hips;
    if (path === 'scale') continue;               // leave bone scales (~1)
    if (path === 'rotation' && !isHips) continue;  // child rotations are already correct
    const outIdx = anim.samplers[ch.sampler].output;
    if (done.has(outIdx)) continue;
    done.add(outIdx);
    const acc = json.accessors[outIdx];
    const base = accOffset(acc);
    for (let i = 0; i < acc.count; i++) {
      if (path === 'translation') {
        const o = base + i * 12;
        const t = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
        const r = (isHips ? qrot(qA, t) : t).map((v) => v * sc); // cm→m (Hips also rotated)
        dv.setFloat32(o, r[0], true); dv.setFloat32(o + 4, r[1], true); dv.setFloat32(o + 8, r[2], true);
      } else { // Hips rotation: rebase by the armature's up-conversion
        const o = base + i * 16;
        const q = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true), dv.getFloat32(o + 12, true)];
        const r = qmul(qA, q);
        for (let k = 0; k < 4; k++) dv.setFloat32(o + k * 4, r[k], true);
      }
    }
    patched++;
  }
}

// Neutralize the armature root + set Hips rest to the baked value (clean for any viewer).
pNode.rotation = [0, 0, 0, 1];
pNode.scale = [1, 1, 1];
const h = json.nodes[hips];
const ht = h.translation || [0, 0, 0];
h.translation = qrot(qA, ht).map((v) => v * sc);
h.rotation = qmul(qA, h.rotation || [0, 0, 0, 1]);
h.scale = [1, 1, 1];

// ── rewrite GLB ──────────────────────────────────────────────────────────────
const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonPadded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonPadded.copy(out, 20);
const p = 20 + jsonPadded.length;
out.writeUInt32LE(binPadded.length, p); out.writeUInt32LE(0x004e4942, p + 4); binPadded.copy(out, p + 8);
writeFileSync(PATH, out);

console.log(`Baked ${patched} bone channels (qA=${qA.map((v) => +v.toFixed(3))}, scale=${sc}). Rewrote avatar-anims.glb (${(total / 1024).toFixed(0)} KB).`);
