import { Chip } from '@/components/presentation/foundation/chip';
import { haptics } from '@/components/presentation/foundation/haptics';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { SheetHeader } from '@/components/presentation/foundation/sheet-header';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { REST_TICK_MS } from '@/components/presentation/live-workout/rest-pill';
import { upNextText, useLiveRest } from '@/components/smart/live-rest';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useNow } from '@/hooks/useNow';
import { Rest } from '@/models/blueprint-models';
import {
  programWithExerciseRest,
  RoutineExerciseLocation,
  routineExerciseLocation,
  routineExerciseRest,
  sessionWithExerciseRest,
  withRest,
} from '@/models/rest-default';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import {
  isRestPreset,
  REST_PRESETS,
  REST_STEP,
  restPhaseOf,
  withRestSkipped,
  withRestStarted,
  withRestStepped,
} from '@/models/session-models/rest';
import { useAppSelector } from '@/store';
import { selectActiveProgram, updateProgram } from '@/store/program';
import { selectActiveSession, updateStoredSession } from '@/store/stored-sessions';
import { formatCountdown, formatTimeSpan } from '@/utils/format-time-span';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

/** A saved default, kept so Undo can put back exactly what was there. */
interface SavedRest {
  ownerIndex: number;
  programId: string;
  location: RoutineExerciseLocation;
  minRest: Duration;
  routineBefore: Rest;
  sessionBefore: Rest;
}

/** The rest sheet over the live workout, opened from the header's rest pill. */
export function RestSheet() {
  const session = useAppSelector(selectActiveSession);
  const { back } = useRouter();

  const hasSession = !!session;
  useEffect(() => {
    if (!hasSession) {
      back();
    }
  }, [hasSession, back]);

  return session ? <RestSheetContent session={session} /> : null;
}

function RestSheetContent({ session }: { session: Session }) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { back } = useRouter();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const program = useAppSelector(selectActiveProgram);
  const programId = useAppSelector((x) => x.program.activePlanId);
  const rest = useLiveRest(session);
  const now = useNow(REST_TICK_MS);
  const phase = restPhaseOf(rest.window, now);
  const [saved, setSaved] = useState<SavedRest>();

  const updateSession = (update: (session: Session) => Session) =>
    dispatch(updateStoredSession({ sessionId: session.id, update }));

  const resting = phase.kind === 'resting';
  const bigClock = resting
    ? formatCountdown(phase.remaining)
    : phase.kind === 'ready'
      ? formatTimeSpan(Duration.ZERO)
      : formatTimeSpan(rest.idleRest ?? Duration.ZERO);
  const subtitle = resting
    ? upNextText(t, rest.upNext)
    : phase.kind === 'ready'
      ? t('rest_sheet.over.subtitle', { upNext: upNextText(t, rest.upNext) })
      : t('rest_sheet.idle.subtitle');
  const activeLength = resting ? phase.length : rest.idleRest;

  const owner =
    rest.ownerIndex === undefined
      ? undefined
      : (session.recordedExercises[rest.ownerIndex] as RecordedWeightedExercise);
  const picked = phase.kind === 'idle' ? undefined : session.restTimer?.length;
  const location =
    owner && rest.ownerIndex !== undefined && program
      ? routineExerciseLocation(program, session.blueprint, rest.ownerIndex)
      : undefined;
  const savedHere = saved && saved.ownerIndex === rest.ownerIndex ? saved : undefined;
  const offerSave =
    !savedHere &&
    owner &&
    location &&
    picked &&
    isRestPreset(picked) &&
    !picked.equals(owner.blueprint.restBetweenSets.rest);

  const pickPreset = (length: Duration) => {
    setSaved(undefined);
    updateSession((s) => withRestStarted(s, length, OffsetDateTime.now()));
  };

  const save = () => {
    if (!owner || rest.ownerIndex === undefined || !location || !picked) {
      return;
    }
    const routineBefore = routineExerciseRest(program, location);
    if (!routineBefore) {
      return;
    }
    const ownerIndex = rest.ownerIndex;
    const sessionBefore = owner.blueprint.restBetweenSets;
    dispatch(
      updateProgram({
        programId,
        update: (p) => programWithExerciseRest(p, location, withRest(routineBefore, picked)),
      }),
    );
    updateSession((s) => sessionWithExerciseRest(s, ownerIndex, withRest(sessionBefore, picked)));
    haptics.selection();
    setSaved({ ownerIndex, programId, location, minRest: picked, routineBefore, sessionBefore });
  };

  const undo = () => {
    if (!saved) {
      return;
    }
    dispatch(
      updateProgram({
        programId: saved.programId,
        update: (p) => programWithExerciseRest(p, saved.location, saved.routineBefore),
      }),
    );
    updateSession((s) => sessionWithExerciseRest(s, saved.ownerIndex, saved.sessionBefore));
    setSaved(undefined);
  };

  const step = REST_STEP.toMillis() / 1000;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.card }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: insets.bottom + spacing[6],
          gap: spacing[4] + 2,
        }}
      >
        <SheetHeader title={t('rest_sheet.title')} onClose={back} />
        <View style={{ alignItems: 'center', gap: spacing[1] }}>
          <SurfaceText
            testID="rest-sheet-clock"
            numeric
            weight="600"
            accessibilityRole="timer"
            style={{
              fontSize: 64,
              lineHeight: 72,
              letterSpacing: -2,
              color: resting ? tokens.ink : phase.kind === 'ready' ? tokens.accentInk : tokens.muted,
            }}
          >
            {bigClock}
          </SurfaceText>
          <SurfaceText font="text-sm" style={{ color: tokens.muted, textAlign: 'center' }}>
            {subtitle}
          </SurfaceText>
        </View>
        <ProgressBar
          progress={resting ? phase.remaining.toMillis() / phase.length.toMillis() : 0}
          accessibilityLabel={t('rest_sheet.progress.label')}
          height={6}
        />
        {resting ? (
          <View style={{ flexDirection: 'row', gap: spacing[2] + 2, alignItems: 'center' }}>
            <StepButton
              testID="rest-sheet-minus"
              label={`−${step}`}
              accessibilityLabel={t('rest_sheet.minus.label')}
              onPress={() => updateSession((s) => withRestStepped(s, -1, OffsetDateTime.now()))}
            />
            <Pressable
              testID="rest-sheet-skip"
              accessibilityRole="button"
              onPress={() => {
                updateSession(withRestSkipped);
                back();
              }}
              style={{ flex: 1 }}
            >
              {({ pressed }) => (
                <View
                  // Skip also closes the sheet; see ActionButton for why the label must not move.
                  collapsable={false}
                  style={{
                    minHeight: 60,
                    borderRadius: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: tokens.inverse,
                    opacity: pressed ? 0.85 : 1,
                  }}
                >
                  <SurfaceText font="text-base" weight="600" style={{ color: tokens.inverseInk }}>
                    {t('rest_sheet.skip.button')}
                  </SurfaceText>
                </View>
              )}
            </Pressable>
            <StepButton
              testID="rest-sheet-plus"
              label={`+${step}`}
              accessibilityLabel={t('rest_sheet.plus.label')}
              onPress={() => updateSession((s) => withRestStepped(s, 1, OffsetDateTime.now()))}
            />
          </View>
        ) : null}
        <View style={{ gap: spacing[2] }}>
          <SurfaceText font="text-sm" weight="600" accessibilityRole="header" style={{ color: tokens.muted }}>
            {resting ? t('rest_sheet.restart.title') : t('rest_sheet.start.title')}
          </SurfaceText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {REST_PRESETS.map((length) => {
              const label = formatTimeSpan(length);
              return (
                <Chip
                  key={label}
                  testID={`rest-preset-${length.seconds()}`}
                  label={label}
                  numeric
                  accessibilityLabel={t('rest_sheet.preset.label', { time: label })}
                  selected={!!activeLength?.equals(length)}
                  onPress={() => pickPreset(length)}
                  style={{ width: '33.33%' }}
                  contentStyle={{ minHeight: 46, borderRadius: 14 }}
                />
              );
            })}
          </View>
        </View>
        {savedHere && owner ? (
          <RememberRow
            testID="rest-sheet-undo"
            title={t('rest_sheet.saved.title', {
              name: owner.blueprint.name,
              time: formatTimeSpan(savedHere.minRest),
            })}
            subtitle={t('rest_sheet.saved.subtitle')}
            action={t('generic.undo.button')}
            onPress={undo}
          />
        ) : offerSave ? (
          <RememberRow
            testID="rest-sheet-save"
            title={t('rest_sheet.remember.title', { time: formatTimeSpan(picked), name: owner.blueprint.name })}
            subtitle={t('rest_sheet.remember.subtitle', {
              time: formatTimeSpan(owner.blueprint.restBetweenSets.rest),
            })}
            action={t('rest_sheet.remember.button')}
            onPress={save}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function StepButton(props: { label: string; accessibilityLabel: string; onPress: () => void; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 72,
            minHeight: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? tokens.track : tokens.bg,
          }}
        >
          <SurfaceText font="text-base" numeric weight="600" style={{ color: tokens.ink }}>
            {props.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}

/** "Use 2:00 for Bench Press from now on", and once saved, the same row with Undo. */
function RememberRow(props: { title: string; subtitle: string; action: string; onPress: () => void; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.subtitle}`}
      accessibilityHint={props.action}
      onPress={props.onPress}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            paddingVertical: spacing[3],
            paddingHorizontal: spacing[3] + 2,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: pressed ? tokens.track : tokens.bg,
          }}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.ink }}>
              {props.title}
            </SurfaceText>
            <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
              {props.subtitle}
            </SurfaceText>
          </View>
          <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
            {props.action}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}
