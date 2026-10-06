import './adapters/appearance';
import { FormatSimple, Tolgee, TolgeeProvider } from '@tolgee/react';
import { OffsetDateTime } from '@js-joda/core';
import { useEffect, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  NumberPad,
  numberPadReducer,
  numberPadValue,
  openNumberPad,
  weightAccessoryFor,
} from '@/components/presentation/foundation/number-pad';
import { SetTable, type SetTableCell, type SetTableRow } from '@/components/presentation/live-workout/set-table';
import { AppThemeProvider, useAppTheme } from '@/hooks/useAppTheme';
import { RecordedWeightedExercise, type Session } from '@/models/session-models';
import type { SetPosition } from '@/models/session-models/recorded-weighted-exercise';
import { formatRpe, type Rpe } from '@/models/session-models/rpe';
import {
  setRowsOf,
  type SetDrafts,
  type SetEntryState,
  type SetField,
  withAddedSet,
  withSetRpe,
  withSetToggled,
  withTypedValue,
} from '@/models/session-models/set-entry';
import { setColorSchemeSeed, setThemeMode } from '@/store/settings';
import { setActiveSession, updateStoredSession } from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import en from '@/i18n/en.json';

import { parseSession } from './contract';
import { browserStore, useAppSelector } from './store';
import './style.css';

const NO_DRAFTS: SetDrafts = {};
const BLUE_ACCENT = '#2F5BD3';
const tolgee = Tolgee().use(FormatSimple()).init({
  language: 'en',
  defaultLanguage: 'en',
  fallbackLanguage: 'en',
  staticData: { en },
});

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string };
type SaveState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'failed'; message: string };
type Editing = { position: SetPosition; field: SetField };

export function BrowserVerificationApp() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'saved' });
  const activeSessionId = useAppSelector((state) => state.storedSessions.activeSessionId);
  const session = useAppSelector((state) =>
    activeSessionId ? state.storedSessions.sessions[activeSessionId] : undefined,
  );
  const savedJson = useRef<string | undefined>(undefined);
  const writeQueue = useRef(Promise.resolve());
  const writeNumber = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/workout', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Workout request failed (${response.status})`);
        }
        const workout = parseSession(await response.json());
        if (cancelled) {
          return;
        }
        savedJson.current = JSON.stringify(workout.toJSON());
        browserStore.dispatch(setActiveSession(workout));
        setLoadState({ kind: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadState.kind !== 'ready' || !session) {
      return;
    }
    const json = JSON.stringify(session.toJSON());
    if (json === savedJson.current) {
      return;
    }

    savedJson.current = json;
    const currentWrite = ++writeNumber.current;
    setSaveState({ kind: 'saving' });
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch('/api/workout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Workout save failed (${response.status})`);
        }
        if (currentWrite === writeNumber.current) {
          setSaveState({ kind: 'saved' });
        }
      })
      .catch((error: unknown) => {
        if (currentWrite === writeNumber.current) {
          setSaveState({
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }, [loadState.kind, session]);

  if (loadState.kind === 'loading') {
    return <PrototypeFrame status="Loading workout…" />;
  }
  if (loadState.kind === 'failed') {
    return <PrototypeFrame status="Workout unavailable" error={loadState.message} />;
  }
  if (!session) {
    return <PrototypeFrame status="Workout unavailable" error="The server returned no active workout." />;
  }

  return <WorkoutPrototype session={session} saveState={saveState} />;
}

function PrototypeFrame(props: { status: string; error?: string }) {
  const { tokens } = useAppTheme();
  return (
    <main className="prototype-page" style={{ backgroundColor: tokens.bg, color: tokens.ink }}>
      <section className="phone-shell phone-shell--message" style={{ backgroundColor: tokens.card }}>
        <p className="eyebrow">Browser prototype</p>
        <h1>{props.status}</h1>
        {props.error ? <p className="error-message">{props.error}</p> : null}
      </section>
    </main>
  );
}

function WorkoutPrototype(props: { session: Session; saveState: SaveState }) {
  const { session, saveState } = props;
  const { tokens, colorScheme } = useAppTheme();
  const colorSchemeSeed = useAppSelector((state) => state.settings.colorSchemeSeed);
  const [drafts, setDrafts] = useState<SetDrafts>(NO_DRAFTS);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [buffer, sendToPad] = useReducer(
    numberPadReducer,
    { placeholder: 0, allowDecimal: false, step: 1 },
    openNumberPad,
  );
  const exercise = session.recordedExercises[0];
  const editingRow =
    editing && exercise instanceof RecordedWeightedExercise
      ? setRowsOf({ exercise, drafts }).find((row) => samePosition(row.position, editing.position))
      : undefined;
  const editingLabel =
    editing && editingRow
      ? `${editing.field === 'weight' ? 'Weight' : 'Reps'} for Set ${editingRow.label}:`
      : undefined;

  useEffect(() => {
    if (!editingLabel) return;
    const content = document.querySelector('.workout-content');
    if (!content) return;
    const reveal = () =>
      document.querySelector(`[aria-label^="${editingLabel}"]`)?.scrollIntoView({ block: 'nearest' });
    const observer = new ResizeObserver(reveal);
    observer.observe(content);
    reveal();
    return () => observer.disconnect();
  }, [editingLabel]);

  if (!(exercise instanceof RecordedWeightedExercise)) {
    return <PrototypeFrame status="Workout unavailable" error="The fixture exercise is not weighted." />;
  }

  const entry: SetEntryState = { exercise, drafts };
  const rows = setRowsOf(entry);

  const applyEntry = (next: SetEntryState) => {
    setDrafts(next.drafts);
    const sessionId = session.id;
    browserStore.dispatch(
      updateStoredSession({
        sessionId,
        update: (stored) => stored.withExercise(0, next.exercise),
      }),
    );
    return next;
  };

  const withTypedBuffer = (state: SetEntryState, edited: Editing | undefined) => {
    const value = edited && buffer.typed !== null ? numberPadValue(buffer) : undefined;
    return edited && value ? withTypedValue(state, edited.position, edited.field, value, 'kilograms') : state;
  };

  const commitEditing = () => {
    if (!editing) {
      return entry;
    }
    return applyEntry(withTypedBuffer(entry, editing));
  };

  const openField = (position: SetPosition, field: SetField, from: SetEntryState = commitEditing()) => {
    const row = setRowsOf(from).find((candidate) => samePosition(candidate.position, position));
    if (!row) {
      return;
    }
    setEditing({ position, field });
    sendToPad({
      type: 'reset',
      field:
        field === 'weight'
          ? { placeholder: row.weight.value.value, allowDecimal: true, step: 2.5 }
          : { placeholder: row.reps.value, allowDecimal: false, step: 1 },
    });
  };

  const closePad = () => {
    commitEditing();
    setEditing(undefined);
  };

  const toggleSet = (position: SetPosition) => {
    const typed = withTypedBuffer(entry, editing);
    applyEntry(withSetToggled(typed, position, OffsetDateTime.now()));
    setEditing(undefined);
  };

  const primaryAction = () => {
    if (!editing) {
      return;
    }
    if (editing.field === 'weight') {
      const committed = applyEntry(withTypedBuffer(entry, editing));
      openField(editing.position, 'reps', committed);
      return;
    }
    toggleSet(editing.position);
  };

  const setRpe = (rpe: Rpe | undefined) => {
    if (editing) {
      applyEntry(withSetRpe(entry, editing.position, rpe));
    }
  };

  const firstUnlogged = rows.find((row) => !row.logged)?.position;
  const tableRows: SetTableRow[] = rows.map((row) => {
    const setLabel = `Set ${row.label}`;
    const weight = cellFor({
      row,
      field: 'weight',
      text: localeFormatBigNumber(row.weight.value.value),
      entered: row.weight.entered,
      editing,
      typed: buffer.typed,
      accessibilityLabel: `Weight for ${setLabel}: ${localeFormatBigNumber(row.weight.value.value)} kg`,
      onPress: () => openField(row.position, 'weight'),
    });
    const reps = cellFor({
      row,
      field: 'reps',
      text: String(row.reps.value),
      entered: row.reps.entered,
      editing,
      typed: buffer.typed,
      accessibilityLabel: `Reps for ${setLabel}: ${row.reps.value}`,
      onPress: () => openField(row.position, 'reps'),
    });
    return {
      key: `${row.position.list}-${row.position.index}`,
      badge: { kind: 'working', number: Number(row.label) },
      badgeAccessibilityLabel: `${setLabel}, change set type unavailable in browser prototype`,
      onPressBadge: () => undefined,
      previous: '-',
      weight,
      reps,
      rpe: row.slot.rpe === undefined ? undefined : formatRpe(row.slot.rpe),
      logged: row.logged,
      isNext: !editing && firstUnlogged !== undefined && samePosition(firstUnlogged, row.position),
      checkAccessibilityLabel: `${row.logged ? 'Undo' : 'Log'} ${setLabel}`,
      onToggle: () => toggleSet(row.position),
      remove: undefined,
    };
  });

  const currentRow = editing ? rows.find((row) => samePosition(row.position, editing.position)) : undefined;
  const padAccessory =
    editing?.field === 'weight'
      ? weightAccessoryFor('barbell', 'kilograms', {
          bar: 20,
          plates: [25, 20, 15, 10, 5, 2.5, 1.25],
        })
      : editing?.field === 'reps'
        ? { kind: 'rpe' as const, value: currentRow?.slot.rpe, onChange: setRpe }
        : undefined;
  const saveLabel =
    saveState.kind === 'saving' ? 'Saving workout' : saveState.kind === 'saved' ? 'Workout saved' : 'Save failed';

  return (
    <main className="prototype-page" style={{ backgroundColor: tokens.bg, color: tokens.ink }}>
      <section className="phone-shell" style={{ backgroundColor: tokens.bg, borderColor: tokens.line2 }}>
        <header className="prototype-header" style={{ borderColor: tokens.line }}>
          <div>
            <p className="eyebrow" style={{ color: tokens.accentInk }}>
              Browser prototype
            </p>
            <h1>{session.blueprint.name}</h1>
            <p className="prototype-note" style={{ color: tokens.muted }}>
              Shared workout components. Native navigation and services are excluded.
            </p>
          </div>
          <div className={`save-status save-status--${saveState.kind}`} role="status" aria-live="polite">
            <span className="save-dot" aria-hidden="true" />
            {saveLabel}
          </div>
          {saveState.kind === 'failed' ? <p className="error-message">{saveState.message}</p> : null}
          <ThemeControls colorScheme={colorScheme} blueAccent={colorSchemeSeed === BLUE_ACCENT} />
        </header>

        <div className="workout-content">
          <div className="exercise-heading">
            <div>
              <p className="exercise-meta" style={{ color: tokens.muted }}>
                Barbell · {rows.length} working sets
              </p>
              <h2>Barbell Bench Press</h2>
            </div>
            <span
              className="exercise-count"
              style={{ backgroundColor: tokens.accentSoft, color: tokens.accentSoftInk }}
            >
              {rows.filter((row) => row.logged).length}/{rows.length}
            </span>
          </div>
          <div className="set-card" style={{ backgroundColor: tokens.card, borderColor: tokens.line }}>
            <SetTable
              weightHeader="kg"
              showsWeight
              rows={tableRows}
              onAddSet={() => applyEntry(withAddedSet(entry, 'kilograms'))}
            />
          </div>
        </div>

        <div className="keypad-container">
          <NumberPad
            visible={editing !== undefined}
            buffer={buffer}
            onAction={sendToPad}
            unit={editing?.field === 'weight' ? 'kilograms' : undefined}
            accessory={padAccessory}
            primary={editing?.field === 'weight' ? 'next' : 'log'}
            onPrimary={primaryAction}
            onHide={closePad}
            bottomInset={0}
          />
        </div>
      </section>
    </main>
  );
}

function ThemeControls(props: { colorScheme: 'light' | 'dark'; blueAccent: boolean }) {
  return (
    <div className="theme-controls" aria-label="Prototype appearance">
      <span>Theme</span>
      <button
        type="button"
        aria-pressed={props.colorScheme === 'light'}
        onClick={() => browserStore.dispatch(setThemeMode('light'))}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={props.colorScheme === 'dark'}
        onClick={() => browserStore.dispatch(setThemeMode('dark'))}
      >
        Dark
      </button>
      <button
        type="button"
        aria-pressed={props.blueAccent}
        onClick={() => browserStore.dispatch(setColorSchemeSeed(BLUE_ACCENT))}
      >
        Blue accent
      </button>
    </div>
  );
}

function cellFor(props: {
  row: ReturnType<typeof setRowsOf>[number];
  field: SetField;
  text: string;
  entered: boolean;
  editing: Editing | undefined;
  typed: string | null;
  accessibilityLabel: string;
  onPress: () => void;
}): SetTableCell {
  const active =
    props.editing !== undefined &&
    props.editing.field === props.field &&
    samePosition(props.editing.position, props.row.position);
  const typed = active && props.typed !== null ? props.typed : undefined;
  return {
    text: typed ?? props.text,
    entered: props.entered || typed !== undefined,
    editing: active,
    caret: active ? (typed === undefined ? 'before' : 'after') : undefined,
    accessibilityLabel: props.accessibilityLabel,
    onPress: props.onPress,
  };
}

function samePosition(left: SetPosition, right: SetPosition) {
  return left.list === right.list && left.index === right.index;
}

declare const document: {
  getElementById(id: string): Parameters<typeof createRoot>[0] | null;
  querySelector(selector: string): { scrollIntoView(options: { block: 'nearest' }): void } | null;
};
declare const ResizeObserver: new (callback: () => void) => {
  observe(element: object): void;
  disconnect(): void;
};
const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing browser verification root');
}

createRoot(root).render(
  <Provider store={browserStore}>
    <SafeAreaProvider>
      <TolgeeProvider tolgee={tolgee}>
        <AppThemeProvider>
          <BrowserVerificationApp />
        </AppThemeProvider>
      </TolgeeProvider>
    </SafeAreaProvider>
  </Provider>,
);
