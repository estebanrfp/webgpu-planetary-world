/**
 * matrix.js - Matrix Math Utilities
 * 
 * 4x4 matrix operations for 3D transformations.
 */

/**
 * Create perspective projection matrix
 */
export const createPerspectiveMatrix = (fovY, aspect, near, far) => {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ]);
};

/**
 * Create Reverse-Z perspective projection matrix (near=1.0, far=0.0)
 * Optimal for planetary scales.
 */
export const createReversePerspectiveMatrix = (fovY, aspect, near, far) => {
  const f = 1.0 / Math.tan(fovY / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, near / (far - near), -1,
    0, 0, (far * near) / (far - near), 0,
  ]);
};

/**
 * Create look-at view matrix
 */
export const createLookAtMatrix = (eye, center, up) => {
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const normalize = (v) => {
    const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return l > 0 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 1];
  };
  
  const zAxis = normalize(subtract(eye, center));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  
  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ]);
};

/**
 * Multiply two 4x4 matrices
 */
export const multiplyMatrices = (a, b) => {
  const result = new Float32Array(16);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i + k * 4] * b[k + j * 4];
      }
      result[i + j * 4] = sum;
    }
  }
  return result;
};

/**
 * Create orthographic projection matrix
 */
export const createOrthoMatrix = (left, right, bottom, top, near, far) => {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, nf, 0,
    (left + right) * lr, (top + bottom) * bt, near * nf, 1,
  ]);
};
