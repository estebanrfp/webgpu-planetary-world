/**
 * CPU port of WGSL hash33 from noise.wgsl.js.
 * Uses Math.fround() at every step to match GPU f32 arithmetic.
 * @module systems/hash
 */

const f = Math.fround;

/** WGSL fract(x) = x - floor(x), in f32 precision. */
const fract = x => { const v = f(x); return f(v - Math.floor(v)); };

/**
 * hash33 — deterministic 3D->3D hash, identical to WGSL noise.wgsl.js.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number[]} [x, y, z] in [0, 1]
 */
export const hash33 = (px, py, pz) => {
  // var q = fract(p * vec3f(443.897, 441.423, 437.195));
  let qx = fract(f(f(px) * f(443.897)));
  let qy = fract(f(f(py) * f(441.423)));
  let qz = fract(f(f(pz) * f(437.195)));

  // q += dot(q, q.yxz + 19.19);
  // dot(q, q.yxz+19.19) = q.x*(q.y+19.19) + q.y*(q.x+19.19) + q.z*(q.z+19.19)
  const d = f(f(f(qx) * f(f(qy) + f(19.19))) + f(f(qy) * f(f(qx) + f(19.19))) + f(f(qz) * f(f(qz) + f(19.19))));
  qx = f(qx + d);
  qy = f(qy + d);
  qz = f(qz + d);

  // return fract((q.xxy + q.yxx) * q.zyx);
  // xxy = [qx, qx, qy], yxx = [qy, qx, qx], zyx = [qz, qy, qx]
  return [
    fract(f(f(f(qx) + f(qy)) * f(qz))),
    fract(f(f(f(qx) + f(qx)) * f(qy))),
    fract(f(f(f(qy) + f(qx)) * f(qx))),
  ];
};
