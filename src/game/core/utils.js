// Tiny helpers that are reused in several modules

/**
 * Returns a shallow copy without the given element.
 * @param {Array} arr
 * @param {*} item
 */
export function dropOne(arr, item) {
  return arr.filter(x => x !== item);
}

/** Clamp helper (because we don't want to depend on Phaser.Math) */
export function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
