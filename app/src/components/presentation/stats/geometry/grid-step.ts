/** Powers of ten to try above `min` before giving up: far past any weight, so only a NaN span gets there. */
const MAX_SCALES = 15;

/**
 * The smallest round step for a chart's grid lines that `fits`: one of `mantissas` times a power of ten, no
 * smaller than `min`, tried smallest first. When nothing fits (a NaN span from corrupt data fits no step), the
 * largest step tried, rather than hang.
 */
export function roundGridStep(
  fits: (step: number) => boolean,
  { mantissas, min }: { mantissas: readonly number[]; min: number },
): number {
  const first = Math.floor(Math.log10(min));
  // Each scale is a fresh power of ten rather than the last one times ten, so 0.1 doesn't drift.
  for (let exponent = first; exponent < first + MAX_SCALES; exponent++) {
    const step = mantissas.map((m) => m * 10 ** exponent).find((candidate) => candidate >= min && fits(candidate));
    if (step !== undefined) {
      return step;
    }
  }
  return Math.max(...mantissas) * 10 ** (first + MAX_SCALES - 1);
}
