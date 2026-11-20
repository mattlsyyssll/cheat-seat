/** Small helper for levels.test.js (kept out of the test file so node's runner does not treat it as a test). */
export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
