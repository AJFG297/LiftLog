/** The muscles field before it was split: primary and secondary muscles in one list. */
interface WithMuscles {
  muscles: string[];
}

/**
 * Splits `muscles` into primary and secondary. A stored descriptor no longer says which was which, so every
 * muscle becomes primary: right for a custom exercise, whose muscles the user picked, and for an edited
 * built-in it counts the muscles it helps in full.
 */
export function splitPrimaryMuscles<T extends WithMuscles>({ muscles, ...rest }: T) {
  return {
    ...rest,
    primaryMuscles: muscles,
    secondaryMuscles: [] as string[],
  };
}
