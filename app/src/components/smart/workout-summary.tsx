import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { ActionButton } from '@/components/presentation/foundation/action-button';
import { Card } from '@/components/presentation/foundation/card';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { FeelPicker } from '@/components/presentation/summary/feel-picker';
import { RoutineUpdatedBanner } from '@/components/presentation/summary/routine-updated-banner';
import { StatCard } from '@/components/presentation/summary/stat-card';
import { BestSetRow, ChangeTone, LoadText, RecordRow } from '@/components/presentation/summary/summary-rows';
import { useServices } from '@/components/smart/services-provider';
import { SHEET_OVER_SUMMARY_HREF, useUndoRoutineUpdate } from '@/components/smart/session-diff-save';
import { useFinishWorkout } from '@/hooks/useFinishWorkout';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useOnDismiss } from '@/hooks/useOnDismiss';
import { fontFamily, numberStyle, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { formatRepsTarget } from '@/models/blueprint-models';
import { SharedSession } from '@/models/feed-models';
import { SESSION_FEELS, SessionFeel, Session } from '@/models/session-models';
import { shortFormatWeightUnit, Weight, WeightUnit } from '@/models/weight';
import {
  BestSetComparison,
  bestSetComparisons,
  durationVsUsual,
  minutesOf,
  NextTarget,
  nextTargets,
  setCounts,
  volumeVsLast,
} from '@/models/workout-summary';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { encryptAndShare } from '@/store/feed';
import { selectActiveProgram, selectRoutineUpdateReceipt, setRoutineUpdateReceipt } from '@/store/program';
import { SessionRecord, sessionRecords } from '@/store/stats/personal-records';
import {
  selectActiveSessionId,
  selectLatestExercises,
  selectPreviousComparableSession,
  selectSession,
  selectSessionsBefore,
  updateStoredSession,
} from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
import { UseTranslateResult, useTranslate } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import { ImperativeRouter, useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

interface WorkoutSummaryProps {
  sessionId: string;
  /**
   * Opened by finishing the workout, which this screen then completes. Otherwise it is a look at the
   * workout so far, and closing it goes back to the workout.
   */
  finished: boolean;
}

const FEEL_KEYS = {
  rough: 'finish.summary.feel_rough.button',
  ok: 'finish.summary.feel_ok.button',
  good: 'finish.summary.feel_good.button',
  great: 'finish.summary.feel_great.button',
} as const satisfies Record<SessionFeel, string>;

/** The workout summary: how it went, how it compares, how it felt, and what next time asks for. */
export function WorkoutSummary({ sessionId, finished }: WorkoutSummaryProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const formatDate = useFormatDate();
  const { sessionService } = useServices();
  const session = useAppSelectorWithArg(selectSession, sessionId);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const previous = useAppSelectorWithArg(selectPreviousComparableSession, session);
  const earlier = useAppSelectorWithArg(selectSessionsBefore, session);
  const program = useAppSelector(selectActiveProgram);
  const latestExercises = useAppSelector(selectLatestExercises);
  const unit: WeightUnit = useAppSelector((x) => x.settings.useImperialUnits) ? 'pounds' : 'kilograms';
  const finishWorkout = useFinishWorkout(sessionId);
  const receipt = useAppSelector(selectRoutineUpdateReceipt);
  const receiptUndo = receipt?.undo;
  const undoUpdate = useUndoRoutineUpdate();
  const [noteDraft, setNoteDraft] = useState(session?.reflection?.note ?? '');

  const close = () => (finished ? goHome(router) : router.back());

  // Finishing clears the active session, so this only ever finishes the workout once, even if the screen
  // is rebuilt.
  const finishing = useRef(false);
  useEffect(() => {
    if (!finished || finishing.current || activeSessionId !== sessionId) {
      return;
    }
    finishing.current = true;
    if (finishWorkout()) {
      router.push(SHEET_OVER_SUMMARY_HREF);
    }
  }, [finished, activeSessionId, sessionId, finishWorkout, router]);

  // Once finished there is no workout to go back to, so Android's back button goes Home like Done does.
  useFocusEffect(() => {
    if (!finished) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome(router);
      return true;
    });
    return () => subscription.remove();
  });

  useEffect(() => {
    if (!session) {
      goHome(router);
    }
  }, [session, router]);

  const saveNote = () => {
    if (!session || noteDraft === (session.reflection?.note ?? '')) {
      return;
    }
    dispatch(
      updateStoredSession({
        sessionId,
        update: (s) => s.with({ reflection: { feel: s.reflection?.feel, note: noteDraft } }),
      }),
    );
  };
  useOnDismiss(() => {
    saveNote();
    dispatch(setRoutineUpdateReceipt(undefined));
  });

  if (!session) {
    return null;
  }

  const pickFeel = (feel: SessionFeel) =>
    dispatch(
      updateStoredSession({
        sessionId,
        update: (s) =>
          s.with({
            reflection: { feel: s.reflection?.feel === feel ? undefined : feel, note: s.reflection?.note ?? '' },
          }),
      }),
    );

  const share = () =>
    dispatch(encryptAndShare({ item: new SharedSession(session), title: t('workout.shared_item.title') }));

  const routineName = session.blueprint.name;
  const routineIndex = program.sessions.findIndex((s) => s.name === routineName);
  const routine = routineIndex >= 0 ? program.sessions[routineIndex] : undefined;
  const dateLine = [
    formatDate(session.date, { weekday: 'long', month: 'short', day: 'numeric' }),
    routine
      ? t('finish.summary.position.label', {
          program: program.name,
          position: routineIndex + 1,
          total: program.sessions.length,
        })
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const records = sessionRecords(session, earlier);
  const comparisons = bestSetComparisons(session, previous);
  const targets =
    finished && routine
      ? nextTargets(sessionService.hydrateSessionFromBlueprint(routine, latestExercises), session)
      : [];

  return (
    <FullHeightScrollView
      avoidKeyboard
      safeAreaEdges={{ top: 'additive', left: 'additive', right: 'additive', bottom: 'off' }}
      contentContainerStyle={{
        paddingHorizontal: spacing.pageHorizontalMargin,
        paddingTop: spacing[2],
        gap: spacing[4],
      }}
      floatingChildren={
        <View
          style={{
            paddingHorizontal: spacing.pageHorizontalMargin,
            paddingTop: spacing[2],
            // FullHeightScrollView lifts the bar above the iOS home indicator. On Android nothing does, and
            // with no tab bar below it the bar has to clear the system navigation bar itself.
            paddingBottom: spacing[3] + (Platform.OS === 'android' ? insets.bottom : 0),
            backgroundColor: tokens.bg,
            borderTopWidth: 1,
            borderTopColor: tokens.line,
          }}
        >
          <ActionButton label={t('finish.summary.done.button')} onPress={close} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RoundIconButton icon="close" accessibilityLabel={t('generic.close.button')} onPress={close} />
        {finished ? (
          <RoundIconButton
            icon="share"
            label={t('generic.share.button')}
            accessibilityLabel={t('workout.share_workout.button')}
            onPress={share}
          />
        ) : null}
      </View>

      {receipt ? (
        <RoutineUpdatedBanner
          message={receipt.message}
          undoLabel={t('generic.undo.button')}
          onUndo={receiptUndo ? () => undoUpdate(receiptUndo) : undefined}
        />
      ) : null}

      <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          {finished ? <MsIconSrc name="check" size={16} color={tokens.accentInk} /> : null}
          <SurfaceText
            font="text-sm"
            weight="700"
            style={{ color: tokens.accentInk, letterSpacing: 1, textTransform: 'uppercase' }}
          >
            {finished ? t('finish.summary.complete.label') : t('finish.summary.in_progress.label')}
          </SurfaceText>
        </View>
        <SurfaceText font="text-3xl" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
          {routineName}
        </SurfaceText>
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {dateLine}
        </SurfaceText>
      </View>

      <StatCards session={session} earlier={earlier} previous={previous} records={records} unit={unit} t={t} />

      {records.length ? (
        <Card style={{ gap: spacing[3] }}>
          <SectionTitle>{t('finish.summary.new_records.title')}</SectionTitle>
          {records.map((record) => (
            <RecordRow key={record.key} {...recordCopy(t, record, unit)} />
          ))}
        </Card>
      ) : null}

      {comparisons.length ? (
        <Card style={{ gap: spacing[1] }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: spacing[1],
            }}
          >
            <SectionTitle>{t('finish.summary.compared.title')}</SectionTitle>
            <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
              {t('finish.summary.best_set.label')}
            </SurfaceText>
          </View>
          {comparisons.map((comparison, index) => (
            <BestSetRow
              key={comparison.key}
              first={index === 0}
              exerciseName={comparison.name}
              {...bestSetCopy(t, comparison)}
            />
          ))}
        </Card>
      ) : null}

      {finished ? (
        <Card style={{ gap: spacing[3] }}>
          <SectionTitle>{t('finish.summary.feel.title')}</SectionTitle>
          <FeelPicker
            options={SESSION_FEELS.map((feel) => ({ value: feel, label: t(FEEL_KEYS[feel]) }))}
            selected={session.reflection?.feel}
            onPick={pickFeel}
          />
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            onBlur={saveNote}
            multiline
            placeholder={t('finish.summary.note.label')}
            placeholderTextColor={tokens.placeholder}
            accessibilityLabel={t('finish.summary.note.label')}
            style={{
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: tokens.line3,
              paddingHorizontal: 14,
              paddingVertical: spacing[3],
              color: tokens.ink,
              fontFamily: fontFamily.text,
              fontSize: 14,
            }}
          />
        </Card>
      ) : null}

      {targets.length ? <NextTargets name={routineName} targets={targets} t={t} /> : null}
    </FullHeightScrollView>
  );
}

/**
 * The summary sits on the root stack, above the workout tab, which still holds the finished workout's
 * screen. Popping the summary first means '/' then pops that screen too, where on its own it would push a
 * second Home on top of it.
 */
function goHome(router: ImperativeRouter) {
  if (router.canGoBack()) {
    router.back();
  }
  router.dismissTo('/');
}

function SectionTitle({ children }: { children: string }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText font="text-lg" weight="700" accessibilityRole="header" style={{ color: tokens.ink }}>
      {children}
    </SurfaceText>
  );
}

function StatCards({
  session,
  earlier,
  previous,
  records,
  unit,
  t,
}: {
  session: Session;
  earlier: readonly Session[];
  previous: Session | undefined;
  records: SessionRecord[];
  unit: WeightUnit;
  t: UseTranslateResult['t'];
}) {
  const minutes = minutesOf(session);
  const duration = durationVsUsual(session, earlier);
  const volume = volumeVsLast(session, previous);
  const sets = setCounts(session);
  const name = session.blueprint.name;

  const durationCaption =
    duration.type === 'longer'
      ? t('finish.summary.duration_longer.body', { minutes: duration.minutes })
      : duration.type === 'shorter'
        ? t('finish.summary.duration_shorter.body', { minutes: duration.minutes })
        : duration.type === 'same'
          ? t('finish.summary.duration_same.body')
          : undefined;
  const volumeCaption =
    volume.type === 'up'
      ? t('finish.summary.volume_up.body', { percent: localeFormatBigNumber(new BigNumber(volume.percent)), name })
      : volume.type === 'down'
        ? t('finish.summary.volume_down.body', { percent: localeFormatBigNumber(new BigNumber(volume.percent)), name })
        : volume.type === 'same'
          ? t('finish.summary.volume_same.body', { name })
          : t('finish.summary.nothing_to_compare.body');
  const setsCaption =
    sets.warmup === 0
      ? t('finish.summary.sets_working.body', { working: sets.working })
      : sets.warmup === 1
        ? t('finish.summary.sets_one_warmup.body', { working: sets.working })
        : t('finish.summary.sets_warmups.body', { working: sets.working, warmup: sets.warmup });
  const volumeWeight = session.totalWeightLifted.convertTo(unit);

  return (
    <View style={{ gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <StatCard
          label={t('finish.summary.duration.label')}
          value={minutes === undefined ? '-' : formatMinutes(minutes)}
          caption={durationCaption}
        />
        <StatCard
          label={t('finish.summary.volume.label')}
          value={localeFormatBigNumber(volumeWeight.value, 0)}
          unit={shortFormatWeightUnit(unit)}
          caption={volumeCaption}
          captionTone={volume.type === 'up' ? 'positive' : volume.type === 'down' ? 'drop' : 'muted'}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <StatCard
          label={t('finish.summary.sets.label')}
          value={String(sets.working + sets.warmup)}
          caption={setsCaption}
        />
        <StatCard
          inverse
          label={t('finish.summary.records.label')}
          value={String(records.length)}
          caption={records.length ? t('finish.summary.records_some.body') : t('finish.summary.records_none.body')}
        />
      </View>
    </View>
  );
}

function NextTargets({ name, targets, t }: { name: string; targets: NextTarget[]; t: UseTranslateResult['t'] }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={{
        gap: spacing[1],
        paddingVertical: 14,
        paddingHorizontal: spacing[4],
        borderRadius: 18,
        borderWidth: 1,
        borderColor: tokens.line,
        backgroundColor: tokens.bg,
      }}
    >
      <SurfaceText font="text-sm" weight="600" style={{ color: tokens.muted }}>
        {t('finish.summary.next_targets.title', { name })}
      </SurfaceText>
      <SurfaceText font="text-sm" style={{ color: tokens.ink }}>
        {targets.map((target, index) => (
          <Fragment key={`${target.name}-${index}`}>
            {index > 0 ? ' · ' : ''}
            {`${target.name} `}
            <Text style={[numberStyle, { fontWeight: '600' }]}>{targetText(target)}</Text>
          </Fragment>
        ))}
      </SurfaceText>
    </View>
  );
}

function targetText(target: NextTarget): string {
  const reps = formatRepsTarget(target.reps);
  return target.weight ? `${formatLoad(target.weight)} × ${reps}` : `× ${reps}`;
}

function recordCopy(t: UseTranslateResult['t'], record: SessionRecord, unit: WeightUnit) {
  if (record.kind === 'heaviestWeight') {
    return {
      exerciseName: record.exerciseName,
      kind: t('finish.summary.record_heaviest.label'),
      value: loadText(record.weight, 2, record.reps),
      was: t('finish.summary.record_was.label', { value: formatLoad(record.previous) }),
    };
  }
  return {
    exerciseName: record.exerciseName,
    kind: t('finish.summary.record_one_rep_max.label'),
    value: loadText(record.oneRepMax.convertTo(unit), 1),
    was: t('finish.summary.record_was.label', { value: formatLoad(record.previous.convertTo(unit), 1) }),
  };
}

function bestSetCopy(
  t: UseTranslateResult['t'],
  { best, change, tracksWeight }: BestSetComparison,
): { best: string; bestNumeric: boolean; change: string; changeSpoken: string; tone: ChangeTone } {
  const bestCopy = {
    best: tracksWeight
      ? `${formatNumber(best.weight)} × ${best.reps}`
      : t('finish.summary.reps.label', { count: best.reps }),
    bestNumeric: tracksWeight,
  };
  switch (change.type) {
    case 'new':
      return {
        ...bestCopy,
        change: t('finish.summary.change_new.label'),
        changeSpoken: t('finish.summary.change_new_spoken.label'),
        tone: 'new',
      };
    case 'same':
      return {
        ...bestCopy,
        change: t('finish.summary.change_same.label'),
        changeSpoken: t('finish.summary.change_same_spoken.label'),
        tone: 'same',
      };
    case 'weight': {
      const up = change.delta.value.isPositive();
      const amount = formatLoad(change.delta.with({ value: change.delta.value.abs() }));
      return {
        ...bestCopy,
        change: up
          ? t('finish.summary.change_weight_up.label', { amount })
          : t('finish.summary.change_weight_down.label', { amount }),
        changeSpoken: up
          ? t('finish.summary.change_up_spoken.label', { amount })
          : t('finish.summary.change_down_spoken.label', { amount }),
        tone: up ? 'up' : 'down',
      };
    }
    case 'reps': {
      const up = change.delta > 0;
      const count = Math.abs(change.delta);
      const amount = count === 1 ? t('finish.summary.one_rep.label') : t('finish.summary.reps.label', { count });
      return {
        ...bestCopy,
        change: up
          ? count === 1
            ? t('finish.summary.change_rep_up.label')
            : t('finish.summary.change_reps_up.label', { count })
          : count === 1
            ? t('finish.summary.change_rep_down.label')
            : t('finish.summary.change_reps_down.label', { count }),
        changeSpoken: up
          ? t('finish.summary.change_up_spoken.label', { amount })
          : t('finish.summary.change_down_spoken.label', { amount }),
        tone: up ? 'up' : 'down',
      };
    }
  }
}

/** A weight's number alone, to two decimal places at most: a converted weight can carry many. */
function formatNumber(weight: Weight, decimalPlaces = 2): string {
  return localeFormatBigNumber(weight.value.decimalPlaces(decimalPlaces));
}

function loadText(weight: Weight, decimalPlaces: number, reps?: number): LoadText {
  return { amount: formatNumber(weight, decimalPlaces), unit: shortFormatWeightUnit(weight.unit), reps };
}

function formatLoad(weight: Weight, decimalPlaces = 2): string {
  return `${formatNumber(weight, decimalPlaces)} ${shortFormatWeightUnit(weight.unit)}`;
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
