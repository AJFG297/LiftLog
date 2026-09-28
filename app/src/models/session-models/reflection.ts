/** How a finished workout felt, picked on the summary. */
export const SESSION_FEELS = ['rough', 'ok', 'good', 'great'] as const;
export type SessionFeel = (typeof SESSION_FEELS)[number];

export function isSessionFeel(value: unknown): value is SessionFeel {
  return typeof value === 'string' && (SESSION_FEELS as readonly string[]).includes(value);
}

/**
 * What the lifter said about a finished workout: how it felt and a note for next time. Kept on the device
 * only. It is stored with the workout's row but is not part of `SessionJSON`, so the feed, share links and
 * the workout worker never carry it and a phone on an older build still reads every workout it is sent.
 */
export interface SessionReflection {
  feel: SessionFeel | undefined;
  note: string;
}

export function reflectionsEqual(a: SessionReflection | undefined, b: SessionReflection | undefined): boolean {
  return a?.feel === b?.feel && (a?.note ?? '') === (b?.note ?? '');
}

/** Undefined when nothing was said, so an empty reflection stores and compares as none at all. */
export function normalizedReflection(reflection: SessionReflection | undefined): SessionReflection | undefined {
  if (!reflection || (reflection.feel === undefined && reflection.note.trim() === '')) {
    return undefined;
  }
  return reflection;
}
