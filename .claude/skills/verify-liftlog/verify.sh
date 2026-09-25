#!/usr/bin/env bash
# Drive LiftLog on a dedicated Android emulator for verification.
# Usage: verify.sh <setup|build|up|doctor|flow|shot|ui|db|logs|down> [args]
# See SKILL.md next to this file for what each command does and when to use it.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
APP_DIR="$REPO_ROOT/app"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# The native CMake configure steps fail on JDK 24+ ("A restricted method in java.lang.System has been
# called"), which is what Android Studio's bundled JBR now ships, so pin JDK 17.
export JAVA_HOME="${VERIFY_JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

AVD="${VERIFY_AVD:-liftlog-verify}"
EMU_PORT="${VERIFY_EMU_PORT:-5584}"
SERIAL="emulator-$EMU_PORT"
METRO_PORT="${VERIFY_METRO_PORT:-8091}"
APP_ID="com.limajuice.liftlog"
APK="$APP_DIR/android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk"
DEV_URL="exp+liftlog://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A$METRO_PORT"

# Evidence survives `down`; only STATE_DIR (pids, logs of the live instance) is removed.
RUNS_DIR="$REPO_ROOT/.verify-runs"
STATE_DIR="$RUNS_DIR/.state"

ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"

die() { echo "verify: $*" >&2; exit 1; }
adb_s() { "$ADB" -s "$SERIAL" "$@"; }

run_dir() {
  [[ -f "$STATE_DIR/run-id" ]] || die "no active run; start one with: verify.sh up"
  local dir="$RUNS_DIR/$(cat "$STATE_DIR/run-id")"
  mkdir -p "$dir"
  echo "$dir"
}

emu_online() { [[ "$("$ADB" -s "$SERIAL" get-state 2>/dev/null || true)" == "device" ]]; }
emu_avd_name() { adb_s emu avd name 2>/dev/null | head -1 | tr -d '\r'; }

cmd_setup() {
  command -v maestro >/dev/null || die "maestro missing: brew install mobile-dev-inc/tap/maestro"
  [[ -x "$JAVA_HOME/bin/java" ]] || die "JDK 17 missing at $JAVA_HOME: brew install openjdk@17 (or set VERIFY_JAVA_HOME)"
  [[ -x "$EMULATOR" ]] || die "Android emulator missing under $ANDROID_HOME"

  local avd_dir="$HOME/.android/avd/$AVD.avd"
  if [[ -d "$avd_dir" ]]; then
    echo "AVD $AVD already exists"
  else
    # No cmdline-tools/avdmanager here, so write the AVD by hand from whichever system image is installed.
    local sysdir
    sysdir="$(cd "$ANDROID_HOME" && ls -d system-images/*/*/arm64-v8a 2>/dev/null | sort | tail -1)"
    [[ -n "$sysdir" ]] || die "no arm64-v8a system image under $ANDROID_HOME/system-images"
    local target tag
    target="$(echo "$sysdir" | cut -d/ -f2)"
    tag="$(echo "$sysdir" | cut -d/ -f3)"
    mkdir -p "$avd_dir"
    cat > "$avd_dir/config.ini" <<EOF
AvdId=$AVD
avd.ini.displayname=LiftLog Verify
avd.ini.encoding=UTF-8
abi.type=arm64-v8a
hw.cpu.arch=arm64
hw.cpu.ncore=4
hw.ramSize=3072
vm.heapSize=256
hw.lcd.width=1080
hw.lcd.height=2400
hw.lcd.density=420
hw.keyboard=yes
hw.mainKeys=no
hw.gpu.enabled=yes
hw.gpu.mode=auto
hw.initialOrientation=portrait
disk.dataPartition.size=6G
showDeviceFrame=no
image.sysdir.1=$sysdir/
tag.id=${tag%%_ps16k}
target=$target
EOF
    cat > "$HOME/.android/avd/$AVD.ini" <<EOF
avd.ini.encoding=UTF-8
path=$avd_dir
path.rel=avd/$AVD.avd
target=$target
EOF
    echo "created AVD $AVD from $sysdir"
  fi
}

cmd_build() {
  cd "$APP_DIR"
  [[ -d node_modules ]] || npm ci --no-audit --no-fund
  [[ -d android ]] || CI=1 npx expo prebuild --platform android --no-install
  (cd android && ./gradlew app:assembleDebugOptimized -PreactNativeArchitectures=arm64-v8a)
  ls -l "$APK"
}

wait_for() { # wait_for <seconds> <description> <command...>
  local secs="$1" what="$2"; shift 2
  for ((i = 0; i < secs; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "timed out after ${secs}s waiting for $what"
}

booted() { [[ "$(adb_s shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; }
metro_up() { curl -fsS "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q packager-status:running; }

cmd_up() {
  [[ -d "$HOME/.android/avd/$AVD.avd" ]] || die "AVD $AVD missing; run: verify.sh setup"
  [[ -f "$APK" ]] || die "APK missing at $APK; run: verify.sh build"
  mkdir -p "$STATE_DIR"

  if emu_online; then
    [[ -f "$STATE_DIR/emulator.pid" ]] || die "$SERIAL is running but was not started from this checkout; refusing to drive it"
    [[ "$(emu_avd_name)" == "$AVD" ]] || die "$SERIAL is AVD '$(emu_avd_name)', not $AVD; refusing to drive it"
    echo "emulator $SERIAL already up (ours)"
  else
    local window_flag="-no-window"
    [[ "${VERIFY_WINDOW:-0}" == "1" ]] && window_flag=""
    # -no-snapshot keeps every boot cold and identical, so no state leaks between runs through quick-boot.
    nohup "$EMULATOR" -avd "$AVD" -port "$EMU_PORT" -no-snapshot -no-boot-anim -no-audio $window_flag \
      > "$STATE_DIR/emulator.log" 2>&1 &
    echo $! > "$STATE_DIR/emulator.pid"
    echo "booting $AVD on $SERIAL (pid $(cat "$STATE_DIR/emulator.pid"))..."
    wait_for 60 "$SERIAL to attach" emu_online
    wait_for 240 "$SERIAL to finish booting" booted
  fi

  if [[ ! -f "$STATE_DIR/run-id" ]]; then
    date +%Y%m%d-%H%M%S > "$STATE_DIR/run-id"
  fi
  local dir; dir="$(run_dir)"

  echo "installing $APK..."
  adb_s install -r -t "$APK" > /dev/null
  adb_s reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" > /dev/null

  if metro_up; then
    [[ -f "$STATE_DIR/metro.pid" ]] || die "port $METRO_PORT already serves a Metro this checkout did not start; set VERIFY_METRO_PORT"
    echo "metro already up on $METRO_PORT (ours)"
  else
    # Job control gives Metro its own process group, so `down` can stop npx and its node children together.
    set -m
    (cd "$APP_DIR" && CI=1 nohup npx expo start --dev-client --port "$METRO_PORT" > "$STATE_DIR/metro.log" 2>&1) &
    echo $! > "$STATE_DIR/metro.pid"
    set +m
    echo "starting metro on $METRO_PORT..."
    wait_for 120 "metro on $METRO_PORT" metro_up
  fi

  adb_s shell am start -a android.intent.action.VIEW -d "$DEV_URL" "$APP_ID" > /dev/null
  echo "launched dev client against metro :$METRO_PORT"
  echo "run id: $(cat "$STATE_DIR/run-id")  evidence: $dir"
  echo "next: verify.sh flow $SKILL_DIR/flows/ready.yaml"
}

cmd_doctor() {
  local ok=1
  check() { if "${@:2}" >/dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; ok=0; fi; }
  check "maestro on PATH" command -v maestro
  check "JDK at $JAVA_HOME" test -x "$JAVA_HOME/bin/java"
  check "APK built ($APK)" test -f "$APK"
  check "$SERIAL online" emu_online
  if emu_online; then
    local name; name="$(emu_avd_name)"
    if [[ "$name" == "$AVD" ]]; then echo "ok   $SERIAL is AVD $AVD"; else echo "FAIL $SERIAL is AVD '$name', not $AVD"; ok=0; fi
    check "$SERIAL was started from this checkout" test -f "$STATE_DIR/emulator.pid"
    check "$SERIAL boot completed" booted
    local ver; ver="$(adb_s shell dumpsys package "$APP_ID" 2>/dev/null | grep -m1 versionName | tr -d ' \r' || true)"
    if [[ -n "$ver" ]]; then echo "ok   $APP_ID installed ($ver)"; else echo "FAIL $APP_ID not installed"; ok=0; fi
    check "adb reverse tcp:$METRO_PORT" sh -c "'$ADB' -s $SERIAL reverse --list | grep -q tcp:$METRO_PORT"
    local focus; focus="$(adb_s shell dumpsys activity activities 2>/dev/null | grep -m1 -E 'topResumedActivity|mResumedActivity' | tr -d '\r' || true)"
    if [[ "$focus" == *"$APP_ID"* ]]; then echo "ok   $APP_ID in foreground"; else echo "warn foreground: ${focus:-unknown}"; fi
  fi
  check "metro answering on :$METRO_PORT" metro_up
  if metro_up; then
    # The listener must be the Metro this checkout started, serving this checkout's app/ - otherwise the
    # app is running someone else's code.
    local lpid cwd
    lpid="$(lsof -nP -tiTCP:"$METRO_PORT" -sTCP:LISTEN | head -1)"
    cwd="$(lsof -a -p "$lpid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    if [[ "$cwd" == "$APP_DIR" ]]; then echo "ok   metro serves $APP_DIR"; else echo "FAIL metro (pid $lpid) serves ${cwd:-?}, not $APP_DIR"; ok=0; fi
  fi
  if [[ -f "$STATE_DIR/run-id" ]]; then echo "info run $(cat "$STATE_DIR/run-id") -> $RUNS_DIR/$(cat "$STATE_DIR/run-id")"; fi
  [[ $ok == 1 ]] && echo "doctor: healthy" || { echo "doctor: NOT healthy"; return 1; }
}

cmd_flow() { # flow <flow.yaml> [label]
  local flow="${1:?usage: verify.sh flow <flow.yaml> [label]}"
  [[ -f "$flow" ]] || die "no such flow: $flow"
  flow="$(cd "$(dirname "$flow")" && pwd)/$(basename "$flow")"
  local label="${2:-$(basename "$flow" .yaml)}"
  local out; out="$(run_dir)/$(date +%H%M%S)-$label"
  mkdir -p "$out"
  # Run from the output dir so `takeScreenshot` files land next to the maestro report.
  local rc=0
  (cd "$out" && maestro --device "$SERIAL" test --test-output-dir "$out" "$flow") 2>&1 | tee "$out/maestro.log" || rc=$?
  adb_s exec-out screencap -p > "$out/final.png" || true
  echo "flow $label exit=$rc evidence: $out"
  return "$rc"
}

cmd_shot() {
  local name="${1:-shot}"
  local f; f="$(run_dir)/$(date +%H%M%S)-$name.png"
  adb_s exec-out screencap -p > "$f"
  echo "$f"
}

cmd_ui() { # dump the current screen's view hierarchy (resource-id = RN testID)
  local f; f="$(run_dir)/$(date +%H%M%S)-${1:-ui}.xml"
  adb_s shell uiautomator dump /sdcard/verify-ui.xml > /dev/null
  adb_s exec-out cat /sdcard/verify-ui.xml > "$f"
  grep -oE '(text|resource-id|content-desc)="[^"]+"' "$f" | sort -u
  echo "saved $f" >&2
}

cmd_db() { # db "<sql>" - query a snapshot of the app's SQLite database (debug builds allow run-as)
  local sql="${1:?usage: verify.sh db \"<sql>\"}"
  local snap; snap="$(run_dir)/db-$(date +%H%M%S)"
  mkdir -p "$snap"
  for f in db.db db.db-wal db.db-shm; do
    adb_s exec-out run-as "$APP_ID" cat "files/SQLite/$f" > "$snap/$f" 2>/dev/null || rm -f "$snap/$f"
  done
  [[ -s "$snap/db.db" ]] || die "could not read files/SQLite/db.db from $APP_ID"
  echo "-- $sql" > "$snap/query.txt"
  sqlite3 -header "$snap/db.db" "$sql" | tee -a "$snap/query.txt"
}

cmd_logs() { # logs [metro|emulator|app]
  case "${1:-metro}" in
    metro) tail -n 80 "$STATE_DIR/metro.log" ;;
    emulator) tail -n 80 "$STATE_DIR/emulator.log" ;;
    app) adb_s logcat -d -t 300 ReactNativeJS:V ReactNative:V '*:S' ;;
    *) die "logs: metro|emulator|app" ;;
  esac
}

cmd_down() {
  if [[ -f "$STATE_DIR/metro.pid" ]]; then
    local mpid; mpid="$(cat "$STATE_DIR/metro.pid")"
    kill -TERM -- "-$mpid" 2>/dev/null || kill -TERM "$mpid" 2>/dev/null || true
    echo "stopped metro (pgid $mpid)"
  fi
  if [[ -f "$STATE_DIR/emulator.pid" ]]; then
    local epid; epid="$(cat "$STATE_DIR/emulator.pid")"
    if emu_online && [[ "$(emu_avd_name)" == "$AVD" ]]; then
      adb_s reverse --remove-all >/dev/null 2>&1 || true
      adb_s emu kill >/dev/null 2>&1 || true
    fi
    for _ in $(seq 1 30); do kill -0 "$epid" 2>/dev/null || break; sleep 1; done
    kill -0 "$epid" 2>/dev/null && kill -TERM "$epid" 2>/dev/null || true
    echo "stopped emulator (pid $epid)"
  fi
  local run=""
  [[ -f "$STATE_DIR/run-id" ]] && run="$RUNS_DIR/$(cat "$STATE_DIR/run-id")"
  rm -rf "$STATE_DIR"
  [[ -n "$run" ]] && echo "evidence kept at $run"
  return 0
}

case "${1:-}" in
  setup | build | up | doctor | flow | shot | ui | db | logs | down) c="$1"; shift; "cmd_$c" "$@" ;;
  *) sed -n '2,4p' "$0"; exit 2 ;;
esac
