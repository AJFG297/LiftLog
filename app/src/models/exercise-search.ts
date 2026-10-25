import { singularWord } from '@/models/blueprint-models/exercise-name';
import { EXERCISE_ALIASES } from '@/models/exercise-aliases';
import { fuzzyMatchScore } from '@/models/exercise-fuzzy-match';
import { ExerciseDescriptor } from '@/models/exercise-models';

/** One way of naming an exercise, as normalized words and those words run together. */
export interface SearchVariant {
  words: string[];
  /** The words with no spaces between them: `chinup` for Chin-Up. */
  compact: string;
}

/** An exercise as search sees it. */
export interface SearchEntry {
  id: string;
  /** The name's normalized words. */
  words: string[];
  /** Every name it can be found by: its own, then its aliases. */
  variants: SearchVariant[];
}

/** How well one query word matches. A token's best tier counts. */
const TIER = { exact: 1, prefix: 0.8, typo: 0.5, substring: 0.3 } as const;
/** A word shorter than this is matched exactly or not at all: one wrong letter in `row` makes another word. */
const MIN_TYPO = 4;
/** A substring shorter than this matches too much to count (`up` in `cup`). */
const MIN_SUBSTRING = 3;
/** Rewards a name the query covers most of: `Barbell Squat` over `Barbell Squat To A Bench` for "barbell squat". */
const COVERAGE_WEIGHT = 0.5;
/** Rewards a name whose words come in the query's order: `Bench Press` over `Press Bench` for "bench press". */
const IN_ORDER_BONUS = 0.1;
/** The query is the whole name or alias, give or take spacing and punctuation: it beats every partial match. */
const EXACT_NAME_BONUS = 2;
/**
 * Lifts a favoured exercise (one done recently, say) past near-ties. Smaller than one tier step on a word of
 * a short query, so it never lifts a prefix over an exact word, nor anything over a whole name.
 */
const FAVOURED_BOOST = 0.05;

/**
 * Shorthand for equipment, spelled out on both sides: people type it, and one catalog name uses `DB`. `ez` is
 * left alone, as the catalog spells it `EZ-Bar`, which folds to `ez bar`.
 */
const ABBREVIATIONS: Readonly<Record<string, string>> = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell' };

const DIACRITICS = /[\u0300-\u036f]/g;
const APOSTROPHES = /['\u2019]/g;
const WORD_BREAKS = /[\s\-/(),.+:;&_]+/;

/** The words of a name or a query: accents, case, apostrophes and punctuation folded, each word singular. */
function wordsOf(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .split(WORD_BREAKS)
    .filter((word) => word.length > 0)
    .map((word) => {
      const singular = singularWord(word);
      return ABBREVIATIONS[singular] ?? singular;
    });
}

function variantOf(words: string[]): SearchVariant {
  return { words, compact: words.join('') };
}

/**
 * The entry for one exercise. `builtInId` keys its aliases: the catalog id, which Stats, keying its rows by
 * history, passes apart from `id`.
 */
export function searchEntryOf(id: string, name: string, builtInId: string = id): SearchEntry {
  const words = wordsOf(name);
  const aliases = EXERCISE_ALIASES[builtInId] ?? [];
  return { id, words, variants: [variantOf(words), ...aliases.map((alias) => variantOf(wordsOf(alias)))] };
}

// Built on every keystroke from a record whose identity the store keeps until the catalog changes, so the
// entries are worth keeping per record.
const entriesByCatalog = new WeakMap<Record<string, ExerciseDescriptor>, SearchEntry[]>();

/** The entries for a catalog, built once per catalog object. */
export function searchEntriesOf(exercises: Record<string, ExerciseDescriptor>): SearchEntry[] {
  let entries = entriesByCatalog.get(exercises);
  if (!entries) {
    entries = Object.entries(exercises).map(([id, exercise]) => searchEntryOf(id, exercise.name));
    entriesByCatalog.set(exercises, entries);
  }
  return entries;
}

/**
 * The entries matching `query`, by id, higher scoring better. Every query word must match some word of one of
 * the entry's names, in any order. When no entry matches that way, a loose in-order letter match stands in,
 * so an odd abbreviation still finds something. The `favoured` ids get a small boost. Empty for a blank query.
 */
export function searchScores(
  entries: readonly SearchEntry[],
  query: string,
  favoured: readonly string[] = [],
): Map<string, number> {
  const scores = new Map<string, number>();
  const tokens = wordsOf(query);
  if (!tokens.length) {
    return scores;
  }
  const compact = tokens.join('');
  // Most words recur across the catalog, so each token's typo checks are kept for this query.
  const typoChecks = tokens.map(() => new Map<string, boolean>());
  const isTypo = (t: number, word: string) => {
    let typo = typoChecks[t]!.get(word);
    if (typo === undefined) {
      typo = isTypoOf(tokens[t]!, word);
      typoChecks[t]!.set(word, typo);
    }
    return typo;
  };
  for (const entry of entries) {
    let best: number | undefined;
    for (const variant of entry.variants) {
      const score = variantScore(tokens, compact, variant, isTypo);
      if (score !== undefined && (best === undefined || score > best)) {
        best = score;
      }
    }
    if (best !== undefined) {
      scores.set(entry.id, best);
    }
  }
  if (!scores.size) {
    const loose = tokens.join(' ');
    for (const entry of entries) {
      const score = fuzzyMatchScore(loose, entry.words.join(' '));
      if (score !== null) {
        scores.set(entry.id, score);
      }
    }
  }
  for (const id of favoured) {
    const score = scores.get(id);
    if (score !== undefined) {
      scores.set(id, score + FAVOURED_BOOST);
    }
  }
  return scores;
}

function wordTier(token: string, word: string): number {
  if (word === token) {
    return TIER.exact;
  }
  if (word.startsWith(token)) {
    return TIER.prefix;
  }
  return token.length >= MIN_SUBSTRING && word.includes(token) ? TIER.substring : 0;
}

/** A misspelling of the word, or of its start as far as the token goes: "squet" for Squat, "benhc" for Bench. */
function isTypoOf(token: string, word: string): boolean {
  const max = token.length >= 7 ? 2 : 1;
  return (
    withinEdits(token, word, max) ||
    (word.length > token.length && withinEdits(token, word.slice(0, token.length), max))
  );
}

/** Whether the optimal string alignment distance is at most `max`: a swap of two neighbours counts as one edit. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) {
    return false;
  }
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let distance = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, before[j - 2]! + 1);
      }
      row.push(distance);
      rowMin = Math.min(rowMin, distance);
    }
    // No row's minimum is below the one before it, so the distance can only grow from here.
    if (rowMin > max) {
      return false;
    }
    before = previous;
    previous = row;
  }
  return previous[b.length]! <= max;
}

/** Exact or prefix only: a run-together match is a deliberate spelling, not a stray substring. */
function joinedTier(token: string, joined: string): number {
  return joined === token ? TIER.exact : joined.startsWith(token) ? TIER.prefix : 0;
}

function variantScore(
  tokens: readonly string[],
  queryCompact: string,
  variant: SearchVariant,
  isTypo: (token: number, word: string) => boolean,
): number | undefined {
  const { words } = variant;
  const tiers = tokens.map(() => 0);
  // Per token, the first word its best match covers and how many words that is.
  const at = tokens.map(() => -1);
  const spans = tokens.map(() => 0);
  const take = (token: number, tier: number, word: number, span: number) => {
    if (tier > tiers[token]!) {
      tiers[token] = tier;
      at[token] = word;
      spans[token] = span;
    }
  };

  tokens.forEach((token, t) => {
    words.forEach((word, w) => take(t, wordTier(token, word), w, 1));
    // One token for two words: "chinup" for Chin-Up.
    for (let w = 0; w + 1 < words.length; w++) {
      if (token.length > words[w]!.length) {
        take(t, joinedTier(token, words[w]! + words[w + 1]!), w, 2);
      }
    }
  });
  // Two tokens for one word: "pull up" for Pullups.
  for (let t = 0; t + 1 < tokens.length; t++) {
    const joined = tokens[t]! + tokens[t + 1]!;
    words.forEach((word, w) => {
      const tier = joinedTier(joined, word);
      take(t, tier, w, 1);
      take(t + 1, tier, w, 1);
    });
  }

  // The costliest check, so only for tokens nothing better matched, and none once a token can't match.
  for (let t = 0; t < tokens.length; t++) {
    if (tokens[t]!.length >= MIN_TYPO && tiers[t]! < TIER.typo) {
      words.forEach((word, w) => take(t, isTypo(t, word) ? TIER.typo : 0, w, 1));
    }
    if (tiers[t] === 0) {
      return undefined;
    }
  }
  const covered = new Set<number>();
  at.forEach((word, t) => {
    for (let i = 0; i < spans[t]!; i++) {
      covered.add(word + i);
    }
  });
  const inOrder = at.every((word, t) => t === 0 || word >= at[t - 1]!);
  const mean = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  return (
    mean +
    COVERAGE_WEIGHT * (covered.size / words.length) +
    (inOrder ? IN_ORDER_BONUS : 0) +
    (queryCompact === variant.compact ? EXACT_NAME_BONUS : 0)
  );
}
