import { singularWord } from '@/models/blueprint-models/exercise-name';
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
  /** Every name it can be found by, its own first. */
  variants: SearchVariant[];
}

/** How well one query word matches. A token's best tier counts. */
const TIER = { exact: 1, prefix: 0.8, substring: 0.3 } as const;
/** A substring shorter than this matches too much to count (`up` in `cup`). */
const MIN_SUBSTRING = 3;
/** Rewards a name the query covers most of: `Barbell Squat` over `Barbell Squat To A Bench` for "barbell squat". */
const COVERAGE_WEIGHT = 0.5;
/** Rewards a name whose words come in the query's order: `Bench Press` over `Press Bench` for "bench press". */
const IN_ORDER_BONUS = 0.1;
/** The query is the whole name, give or take spacing and punctuation: it beats every partial match. */
const EXACT_NAME_BONUS = 2;

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

/** The entry for one exercise. */
export function searchEntryOf(id: string, name: string): SearchEntry {
  const words = wordsOf(name);
  return { id, words, variants: [variantOf(words)] };
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
 * so an odd abbreviation still finds something. Empty for a blank query.
 */
export function searchScores(entries: readonly SearchEntry[], query: string): Map<string, number> {
  const scores = new Map<string, number>();
  const tokens = wordsOf(query);
  if (!tokens.length) {
    return scores;
  }
  const compact = tokens.join('');
  for (const entry of entries) {
    let best: number | undefined;
    for (const variant of entry.variants) {
      const score = variantScore(tokens, compact, variant);
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

/** Exact or prefix only: a run-together match is a deliberate spelling, not a stray substring. */
function joinedTier(token: string, joined: string): number {
  return joined === token ? TIER.exact : joined.startsWith(token) ? TIER.prefix : 0;
}

function variantScore(tokens: readonly string[], queryCompact: string, variant: SearchVariant): number | undefined {
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

  if (tiers.some((tier) => tier === 0)) {
    return undefined;
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
