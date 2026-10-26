# Rest notification regression evidence

PR #68 changes the Android worker's generated message contract. It requires a new native APK when released. No EAS update or build was published.

## Preview lineage

Read-only EAS metadata identifies the following Android artifacts. This is repository/build evidence, not a reading from the reporting phone.

| Artifact | Revision | Runtime |
| --- | --- | --- |
| October 4 preview build `d0cdf887-e76f-4904-a20e-2398485c126d` | `f88bf947` | `018d2892babff82f6f860a7ad49f3c0c497ac12a` |
| October 13 update `01a1361f-72df-7db8-8a31-24be48740755` | `62860e01` | `018d2892babff82f6f860a7ad49f3c0c497ac12a` |
| October 25 update `01a172c7-e93c-7828-8b9d-347b51647032` | `521fa550` | `018d2892babff82f6f860a7ad49f3c0c497ac12a` |

The October 13 revision writes session version 10. Partial reps advanced it to 11 on October 22. The next listed preview update, October 24 at `1b39679d`, carries that change. The older Kotlin constructor rejects the new version before service enqueue, so neither countdown updates nor completion cues reach the worker.

A newer October 24 APK also exists with runtime `2365369953f2069b3c55357b708fdfbcd1629b9e`. Its strict decoder accepts version 11. The reporting handset's actual runtime was not inspected. If it runs this newer APK, the reproduced cross-runtime mismatch does not establish that handset's cause.

The October 4 EAS APK expired on October 18 and could not be downloaded. The baseline therefore uses the existing version-10 development APK, whose compiled constraint and unchanged worker implementation match the relevant old contract. Building current main from scratch would generate a version-11 decoder and hide this OTA mismatch. Baseline JavaScript is current preview behavior; the fix changes its erased TypeScript contract, not the emitted workout values.

## Root cause and fix

Generated Kotlin validated the storage-version literal inside the complete workout snapshot. The worker does not migrate or persist that snapshot. `WorkerWorkout` now treats version as numeric metadata while retaining the existing required fields.

The native module's schema input is a symlink into `docs/schemas/workout-worker`. Expo's directory hashing skips symlinks. The real schema directory is now an explicit fingerprint source. The sensitivity check changed only a schema file, observed a different runtime hash, restored the file, and recovered the original hash. See `fingerprint-sensitivity.log`.

An unconditional version-10 payload would break the version-11 APK. A retry cannot safely classify the native failure because Expo exposes only `InvocationTargetException`. Neither workaround shipped.

## Executed checks

- `npm run typecheck`, `npm run lint`, and `npm run format:check` passed.
- `npx vitest run` passed 2,880 tests; two were skipped. Earlier contended attempts timed out during native compilation and disk exhaustion. The final clean run passed with the normal command. See `vitest-clean.log`.
- All six native worker unit tests passed. `native-after.xml` contains three decoder cases, and `native-set-target-after.xml` contains three existing target cases. The decoder test failed for versions 10 and 12 before the fix and passed for 10, 11, and 12 afterward. This proves changed version metadata with the existing shape, not arbitrary future schemas.
- The native APK was rebuilt at reviewed head `4a1d9036`. The helper's optimized variant hit a corrupt shared Gradle transform, so runtime QA used standard `app:assembleDebug`, with one Gradle worker on the successful retry. This exercises the same worker Kotlin code. APK SHA-256 was `287efa3c73cebd9db02b996c9e72cf59b3af2e0b1f788cdbdfeaaf1ef792eb67`.

## Native runtime results

The project verification helper and Maestro drove the app on isolated `emulator-5584`, AVD `liftlog-verify`, Android API 37. The user's emulator and phones were not changed. The same onboarded empty fixture was used, with Barbell Squat, three planned sets, one logged set, and a three-minute rest preset.

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Current preview JSON on version-10 native | App rest runs; system notification remains generic; bridge rejects updates | `before-light.png`, `before-dark.png`, `baseline-rest-errors.txt` |
| Rebuilt fixed native | Ongoing notification shows rest progress; status-bar chip visibly counts remaining time | `after-light.png`, `after-dark.png`, `after-status-countdown.png` |
| +15 then -15 | Native effective deadline moves forward exactly 15 seconds, then back exactly 15 seconds; elapsed plus remaining equals total | `countdown-assertions.json` |
| Skip a 30-second rest | No completion notification during a 36-second observation | `fixed-cancel-samples.jsonl` |
| Background with screen off | Countdown continues; exactly one completion notification; default ringtone starts and completes | `fixed-locked-samples.jsonl`, `fixed-locked-audio.log` |
| PIN-locked, screen off | Keyguard is showing and input restricted; exactly one completion notification; ringtone starts and completes | `fixed-secure-policy.txt`, `fixed-secure-samples.jsonl`, `fixed-secure-locked-audio.log`, `after-secure-lock-alert.png` |
| Rest notifications off | Ongoing LiftLog notification disappears | `notifications-off.txt`; immediate preference snapshot |
| Rest timers off | Native notification returns to the current exercise, with no rest countdown | `timers-off.txt`; immediate preference snapshot |

The temporary emulator PIN was cleared after the secure-lock check. Both app preferences were restored. These preference checks establish immediate behavior; no separate timed no-sound claim is made for them. Skip has the timed cancellation observation.

Baseline fields, verbatim:

```text
android.text=String (Workout in progress)
android.shortCriticalText=null
```

Fixed fields, verbatim:

```text
android.text=String (Take a rest break)
android.shortCriticalText=String (2:35)
```

Android audio evidence, verbatim:

```text
10-26 21:56:28.458   931   945 D RingtonePlayer: playAsync(uri=content://settings/system/notification_sound, user=UserHandle{0})
10-26 21:56:29.057   931  7830 D RingtonePlayer: player.start piid:39
10-26 21:56:30.859   931  7830 D RingtonePlayer: onCompletion() abandoning AudioFocus
```

## Limits

The helper launches the emulator with host audio disabled. Android's sound request, player start, and completion were observed; audible speaker or headphone output was not heard. Physical phones, headphones, DND, and prolonged deep idle were not tested. Permission-granted behavior was exercised; permission-denial behavior was not separately tested. Existing permission, channel, volume, DND, and headphone policies were unchanged.

Local native evidence runs are `.verify-runs/20261026-211438` for the baseline and `.verify-runs/20261026-214550` for the fix. Host disk exhaustion interrupted earlier attempts. Successful scenarios were replayed after deleting only this checkout's disposable build caches. No browser or code-only check is claimed as proof of notification or sound behavior.
