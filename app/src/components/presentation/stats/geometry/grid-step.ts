/**
 * The smallest round step for a chart's grid lines that `fits`: one of `mantissas` times a power of ten, no
 * smaller than `min`, tried smallest first. `fits` must hold for every large enough step, or this never ends.
 */
export function roundGridStep(
  fits: (step: number) => boolean,
  { mantissas, min }: { mantissas: readonly number[]; min: number },
): number {
  // Each scale is a fresh power of ten rather than the last one times ten, so 0.1 doesn't drift.
  for (let exponent = Math.floor(Math.log10(min)); ; exponent++) {
    const step = mantissas.map((m) => m * 10 ** exponent).find((candidate) => candidate >= min && fits(candidate));
    if (step !== undefined) {
      return step;
    }
  }
}
