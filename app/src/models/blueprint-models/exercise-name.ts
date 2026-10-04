/**
 * Spellings of one word that mean the same thing wherever they appear in a name. The catalog alone spells
 * the fly as `Fly`, `Flye` and `Flyes`, and people type `Flies` and `Flys` too.
 */
const SPELLINGS: Readonly<Record<string, string>> = {
  flye: 'fly',
  flyes: 'fly',
  flies: 'fly',
  flys: 'fly',
};

/**
 * Last words the suffix rules would get wrong. A word that maps to itself is singular already: `abs` is
 * not the plural of `ab`, and `series` has no singular to strip to.
 */
const IRREGULAR: Readonly<Record<string, string>> = {
  abs: 'abs',
  series: 'series',
  calves: 'calf',
};

/**
 * Plural endings, tried in order; the first that matches is stripped. Plain `s` is not stripped after
 * `s` (`press`), `u` (`gluteus`) or `i` (`pelvis`), which end singular words. `ses` keeps its `e`
 * (`raises` to `raise`) unless it is `sses` (`presses` to `press`).
 */
const SUFFIX_RULES: readonly (readonly [RegExp, string])[] = [
  [/ies$/, 'y'],
  [/(ss|x|zz|ch|sh)es$/, '$1'],
  [/([^siu])s$/, '$1'],
];

/**
 * The fuzzy spelling fold the resolver matches names with, for the callers that compare names alone -
 * a saved exercise descriptor, say. Blueprints are compared by id instead.
 *
 * Case and spacing are folded, and the last word is made singular, so `Lunges` meets `Lunge` and
 * `Bench Presses` meets `Bench Press`. Only the last word: in `Biceps Curl` the plural is part of the name.
 */
export function normalizeExerciseName(name: string): string {
  const words = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return '';
  }
  const folded = words.map((word) => SPELLINGS[word] ?? word);
  folded[folded.length - 1] = singular(folded.at(-1)!);
  return folded.join(' ');
}

function singular(word: string): string {
  const irregular = IRREGULAR[word];
  if (irregular) {
    return irregular;
  }
  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (pattern.test(word)) {
      return word.replace(pattern, replacement);
    }
  }
  return word;
}
