#!/usr/bin/env bash
# Drive LiftLog on a dedicated Android emulator slot for verification.
# Usage: verify.sh <setup|build|up|doctor|slots|flow|shot|ui|db|clear|logs|down> [args]
# See SKILL.md next to this file for what each command does and when to use it.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SKILL_DIR/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
APP_DIR="$REPO_ROOT/app"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# The native CMake configure steps fail on JDK 24+ ("A restricted method in java.lang.System has been
# called"), which is what Android Studio's bundled JBR now ships, so pin JDK 17.
export JAVA_HOME="${VERIFY_JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

APP_ID="com.ajfg297.liftlog"
APK="$APP_DIR/android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk"

# Evidence survives `down`; only STATE_DIR (pids, logs and Metro cache of the live instance) is removed.
RUNS_DIR="$REPO_ROOT/.verify-runs"
STATE_DIR="$RUNS_DIR/.state"
# Metro keeps its transform cache under os.tmpdir(), which every checkout shares. Cache keys use paths
# relative to the project root, so sibling worktrees (.claude/worktrees/<name>/) that symlink the same
# node_modules get the same key for expo-router's _ctx file, which bakes in the app root: one checkout's
# Metro then serves another's routes. Metro gets a TMPDIR of its own inside STATE_DIR instead, so every
# `up` also starts from a cold cache.
METRO_TMPDIR="$STATE_DIR/tmp"

# Slots are machine-wide: every checkout on this machine claims from the same directory, so two sessions
# never drive the same emulator. slot-N/ exists while a checkout holds slot N, and its info file names the
# owner checkout, the pid that claimed it, and the emulator and Metro it runs.
SLOTS_DIR="${VERIFY_SLOTS_DIR:-$HOME/.cache/liftlog-verify}"
MAX_SLOTS="${VERIFY_SLOTS:-2}"
CLAIM_LOCK="$SLOTS_DIR/claim.lock"

ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"

die() { echo "verify: $*" >&2; exit 1; }

# --- slots -------------------------------------------------------------------------------------------

slot_avd() { if [[ "$1" == 1 ]]; then echo liftlog-verify; else echo "liftlog-verify-$1"; fi; }
slot_dir() { echo "$SLOTS_DIR/slot-$1"; }
slot_get() {
  local f; f="$(slot_dir "$1")/info"
  if [[ -f "$f" ]]; then sed -n "s/^$2=//p" "$f" | tail -1; fi
}

slot_set() { # slot_set <n> key=value...
  local f tmp kv
  f="$(slot_dir "$1")/info"
  tmp="$f.$$"
  shift
  if [[ -f "$f" ]]; then cp "$f" "$tmp"; else : > "$tmp"; fi
  for kv in "$@"; do
    grep -v "^${kv%%=*}=" "$tmp" > "$tmp.x" || true
    echo "$kv" >> "$tmp.x"
    mv "$tmp.x" "$tmp"
  done
  mv "$tmp" "$f"
}

valid_slot() { [[ "$1" =~ ^[1-9]$ ]]; }

# Sets AVD, EMU_PORT, METRO_PORT, SERIAL and DEV_URL for slot <n>. Values the slot recorded at `up` win
# over the slot's defaults, and explicit VERIFY_* variables win over both.
load_slot() {
  local n="$1"
  SLOT="$n"
  AVD="${VERIFY_AVD:-$(slot_get "$n" avd)}"
  AVD="${AVD:-$(slot_avd "$n")}"
  EMU_PORT="${VERIFY_EMU_PORT:-$(slot_get "$n" emu_port)}"
  EMU_PORT="${EMU_PORT:-$((5582 + 2 * n))}"
  METRO_PORT="${VERIFY_METRO_PORT:-$(slot_get "$n" metro_port)}"
  METRO_PORT="${METRO_PORT:-$((8089 + 2 * n))}"
  SERIAL="emulator-$EMU_PORT"
  DEV_URL="exp+liftlog://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A$METRO_PORT"
}

held_slot() { # the slot this checkout holds, if any
  local d
  for d in "$SLOTS_DIR"/slot-*; do
    [[ -f "$d/info" ]] || continue
    if [[ "$(sed -n 's/^owner=//p' "$d/info" | tail -1)" == "$REPO_ROOT" ]]; then
      echo "${d##*/slot-}"
      return 0
    fi
  done
  return 0
}

require_slot() {
  local n; n="$(held_slot)"
  [[ -n "$n" ]] || die "this checkout holds no slot; start one with: verify.sh up (verify.sh slots lists them)"
  load_slot "$n"
}

pid_cmd() { [[ -n "$1" ]] && ps -o command= -p "$1" 2>/dev/null; }
avd_pid() { ps -axo pid=,command= | awk -v avd="$1" '{ for (i = 2; i < NF; i++) if ($i == "-avd" && $(i + 1) == avd) { print $1; exit } }'; }
serial_online() { [[ "$("$ADB" -s "emulator-$1" get-state 2>/dev/null || true)" == "device" ]]; }
port_pid() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
pid_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'; }

# What is running on slot <n>'s emulator and Metro right now, whoever started it. Empty means nothing.
slot_activity() {
  local n="$1" bits=() p
  load_slot "$n"
  p="$(avd_pid "$AVD")"
  [[ -n "$p" ]] && bits+=("AVD $AVD running (pid $p)")
  serial_online "$EMU_PORT" && bits+=("$SERIAL online")
  p="$(port_pid "$METRO_PORT")"
  [[ -n "$p" ]] && bits+=("port $METRO_PORT served by pid $p from $(pid_cwd "$p")")
  (( ${#bits[@]} )) && { local IFS=';'; echo "${bits[*]}" | sed 's/;/, /g'; }
  return 0
}

# A lock is live while the pid that claimed it is still verify.sh, or while anything runs on the slot.
claimer_alive() { pid_cmd "$1" | grep -q verify.sh; }

slot_state() { # prints: free | ours | held | stale | busy
  local n="$1" d
  d="$(slot_dir "$n")"
  if [[ -d "$d" ]]; then
    if [[ "$(slot_get "$n" owner)" == "$REPO_ROOT" ]]; then echo ours
    elif claimer_alive "$(slot_get "$n" pid)" || [[ -n "$(slot_activity "$n")" ]]; then echo held
    else echo stale
    fi
  elif [[ -n "$(slot_activity "$n")" ]]; then echo busy
  else echo free
  fi
}

# Claiming and releasing run under one machine-wide lock, so checking a slot and taking it is atomic.
# lockf (macOS) and flock (Linux) hold a kernel lock that is dropped if the holder dies.
with_claim_lock() {
  mkdir -p "$SLOTS_DIR"
  if command -v lockf > /dev/null; then lockf -k -t 60 "$CLAIM_LOCK" bash "$SELF" "$@"
  elif command -v flock > /dev/null; then flock -w 60 "$CLAIM_LOCK" bash "$SELF" "$@"
  else die "need lockf or flock to claim a slot"
  fi
}

cmd__claim() { # internal: prints the slot claimed for this checkout, or explains why none is free
  local held; held="$(held_slot)"
  if [[ -n "$held" ]]; then
    [[ -z "${VERIFY_SLOT:-}" || "$VERIFY_SLOT" == "$held" ]] \
      || die "this checkout already holds slot $held; run verify.sh down before asking for slot $VERIFY_SLOT"
    slot_set "$held" "pid=$VERIFY_CLAIMER_PID"
    echo "$held"
    return 0
  fi
  local candidates=() reasons=() n state
  if [[ -n "${VERIFY_SLOT:-}" ]]; then candidates=("$VERIFY_SLOT"); else
    for ((n = 1; n <= MAX_SLOTS; n++)); do candidates+=("$n"); done
  fi
  for n in "${candidates[@]}"; do
    state="$(slot_state "$n")"
    case "$state" in
      held) reasons+=("slot $n is held by $(slot_get "$n" owner) (claimed $(slot_get "$n" claimed))"); continue ;;
      busy) reasons+=("slot $n is in use outside verify.sh slots: $(slot_activity "$n")"); continue ;;
      stale)
        echo "verify: reclaiming slot $n: its owner $(slot_get "$n" owner) left nothing running" >&2
        rm -rf "$(slot_dir "$n")"
        ;;
    esac
    load_slot "$n"
    if [[ ! -d "$HOME/.android/avd/$AVD.avd" ]]; then
      reasons+=("slot $n has no AVD $AVD; create it with: VERIFY_SLOT=$n verify.sh setup")
      continue
    fi
    mkdir "$(slot_dir "$n")"
    slot_set "$n" "owner=$REPO_ROOT" "pid=$VERIFY_CLAIMER_PID" "claimed=$(date +%Y-%m-%dT%H:%M:%S)"
    echo "$n"
    return 0
  done
  {
    echo "verify: no free slot for $REPO_ROOT (VERIFY_SLOTS=$MAX_SLOTS):"
    printf '  %s\n' "${reasons[@]}"
    echo "  Wait for one, or ask the user. Never stop another checkout's emulator."
  } >&2
  exit 1
}

cmd__release() { # internal: drops this checkout's slot lock, and nobody else's
  local n; n="$(held_slot)"
  [[ -n "$n" ]] && rm -rf "$(slot_dir "$n")" && echo "released slot $n"
  return 0
}

cmd_slots() {
  local n top="$MAX_SLOTS" d state
  for d in "$SLOTS_DIR"/slot-*; do
    [[ -d "$d" ]] && (( ${d##*/slot-} > top )) && top="${d##*/slot-}"
  done
  printf '%-5s %-17s %-15s %-6s %-6s %s\n' slot avd serial metro state owner
  for ((n = 1; n <= top; n++)); do
    state="$(slot_state "$n")"
    load_slot "$n"
    local owner="-" up="down"
    [[ -n "$(slot_activity "$n")" ]] && up="up"
    case "$state" in
      ours) owner="$(slot_get "$n" owner) (this checkout)" ;;
      held) owner="$(slot_get "$n" owner)" ;;
      stale) owner="$(slot_get "$n" owner) (stale: nothing running, reclaimable)" ;;
      busy) owner="unclaimed, in use: $(slot_activity "$n")" ;;
      free) owner="free" ;;
    esac
    [[ -d "$(slot_dir "$n")" && ! -d "$(slot_get "$n" owner)" ]] && owner="$owner [checkout missing]"
    printf '%-5s %-17s %-15s %-6s %-6s %s\n' "$n" "$AVD" "$SERIAL" "$METRO_PORT" "$up" "$owner"
  done
}

# --- device helpers ----------------------------------------------------------------------------------

adb_s() { "$ADB" -s "$SERIAL" "$@"; }

run_dir() {
  [[ -f "$STATE_DIR/run-id" ]] || die "no active run; start one with: verify.sh up"
  local dir; dir="$RUNS_DIR/$(cat "$STATE_DIR/run-id")"
  mkdir -p "$dir"
  echo "$dir"
}

emu_online() { [[ "$("$ADB" -s "$SERIAL" get-state 2>/dev/null || true)" == "device" ]]; }
emu_avd_name() { adb_s emu avd name 2>/dev/null | head -1 | tr -d '\r'; }

# The emulator on this slot is ours only if this checkout started it and it is still that process.
our_emulator_pid() {
  local epid; epid="$(cat "$STATE_DIR/emulator.pid" 2>/dev/null || true)"
  [[ -n "$epid" ]] && pid_cmd "$epid" | grep -qE -- "-avd $AVD( |$)" && echo "$epid"
  return 0
}

require_our_emulator() {
  emu_online || die "$SERIAL is not online; run: verify.sh up"
  [[ -n "$(our_emulator_pid)" ]] || die "$SERIAL was not started from this checkout; refusing to drive it"
  [[ "$(emu_avd_name)" == "$AVD" ]] || die "$SERIAL is AVD '$(emu_avd_name)', not $AVD; refusing to drive it"
}

cmd_setup() {
  command -v maestro > /dev/null || die "maestro missing: brew install mobile-dev-inc/tap/maestro"
  [[ -x "$JAVA_HOME/bin/java" ]] || die "JDK 17 missing at $JAVA_HOME: brew install openjdk@17 (or set VERIFY_JAVA_HOME)"
  [[ -x "$EMULATOR" ]] || die "Android emulator missing under $ANDROID_HOME"
  local n="${VERIFY_SLOT:-1}"
  valid_slot "$n" || die "VERIFY_SLOT must be 1-9"
  load_slot "$n"

  local avd_dir="$HOME/.android/avd/$AVD.avd"
  if [[ -d "$avd_dir" ]]; then
    echo "AVD $AVD (slot $n) already exists"
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
avd.ini.displayname=LiftLog Verify $n
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
    echo "created AVD $AVD for slot $n from $sysdir"
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
    if "$@" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  die "timed out after ${secs}s waiting for $what"
}

booted() { [[ "$(adb_s shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; }
metro_up() { curl -fsS "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q packager-status:running; }
foreground() { adb_s shell dumpsys activity activities 2>/dev/null | grep -m1 -E 'topResumedActivity|mResumedActivity' | tr -d '\r' || true; }
bundles_served() { local c; c="$(grep -c 'Bundled' "$STATE_DIR/metro.log" 2>/dev/null || true)"; echo "${c:-0}"; }

# The dev client's floating Tools gear sits over header actions such as the live workout's Finish, and a
# tap by id lands on the element's centre, which opens the dev menu instead. The dev menu reads the gear's
# visibility from its own preferences, so switch it off there before launch, keeping every other key.
hide_dev_menu_gear() {
  local prefs="shared_prefs/expo.modules.devmenu.sharedpreferences.xml"
  local tmp="$STATE_DIR/devmenu-prefs.xml"
  adb_s shell am force-stop "$APP_ID"
  adb_s exec-out run-as "$APP_ID" cat "$prefs" > "$tmp" 2>/dev/null || true
  if ! grep -q '</map>' "$tmp"; then
    printf "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n</map>\n" > "$tmp"
  fi
  sed -i '' -e '/name="showFab"/d' -e 's#</map>#    <boolean name="showFab" value="false" />\
</map>#' "$tmp"
  adb_s push "$tmp" /data/local/tmp/verify-devmenu-prefs.xml > /dev/null
  adb_s shell chmod 644 /data/local/tmp/verify-devmenu-prefs.xml
  adb_s shell run-as "$APP_ID" sh -c "'mkdir -p shared_prefs && cp /data/local/tmp/verify-devmenu-prefs.xml $prefs'"
  adb_s shell rm -f /data/local/tmp/verify-devmenu-prefs.xml
}

# Opens the app on this slot's Metro and waits until Metro has served it a bundle. A fresh install has no
# remembered Metro URL, so the plain launcher intent (and Maestro's launchApp) opens the dev launcher; the
# app can also come up on a published update. Either way no bundle reaches Metro, so re-send the URL.
open_on_metro() {
  local attempt before i fg
  for attempt in 1 2 3; do
    before="$(bundles_served)"
    adb_s shell am start -a android.intent.action.VIEW -d "$DEV_URL" "$APP_ID" > /dev/null
    for ((i = 0; i < 240; i++)); do
      sleep 1
      fg="$(foreground)"
      if (( $(bundles_served) > before )) && [[ "$fg" == *"$APP_ID/.MainActivity"* ]]; then
        echo "app loaded from metro :$METRO_PORT"
        return 0
      fi
      # A cold first bundle can take minutes, but sitting on the launcher this long means the URL was lost.
      if (( i >= 30 )) && [[ "$fg" == *DevLauncher* || "$fg" != *"$APP_ID"* ]]; then break; fi
    done
    echo "app not on metro :$METRO_PORT (attempt $attempt, foreground: ${fg:-unknown}); re-opening $DEV_URL"
  done
  die "app did not load from metro :$METRO_PORT; check verify.sh logs metro"
}

cmd_up() {
  [[ -f "$APK" ]] || die "APK missing at $APK; run: verify.sh build"
  if [[ -n "${VERIFY_SLOT:-}" ]]; then valid_slot "$VERIFY_SLOT" || die "VERIFY_SLOT must be 1-9"; fi
  local n
  export VERIFY_CLAIMER_PID=$$
  n="$(with_claim_lock _claim)" || exit 1
  load_slot "$n"
  if [[ ! -d "$HOME/.android/avd/$AVD.avd" ]]; then
    with_claim_lock _release > /dev/null
    die "AVD $AVD missing; run: VERIFY_SLOT=$n verify.sh setup"
  fi
  slot_set "$n" "avd=$AVD" "emu_port=$EMU_PORT" "metro_port=$METRO_PORT"
  mkdir -p "$STATE_DIR"
  echo "slot $n: AVD $AVD on $SERIAL, metro :$METRO_PORT"

  if emu_online; then
    [[ -n "$(our_emulator_pid)" ]] || die "$SERIAL is running but was not started from this checkout; refusing to drive it"
    [[ "$(emu_avd_name)" == "$AVD" ]] || die "$SERIAL is AVD '$(emu_avd_name)', not $AVD; refusing to drive it"
    echo "emulator $SERIAL already up (ours)"
  else
    local window_flag="-no-window"
    [[ "${VERIFY_WINDOW:-0}" == "1" ]] && window_flag=""
    # -no-snapshot keeps every boot cold and identical, so no state leaks between runs through quick-boot.
    # shellcheck disable=SC2086
    nohup "$EMULATOR" -avd "$AVD" -port "$EMU_PORT" -no-snapshot -no-boot-anim -no-audio $window_flag \
      > "$STATE_DIR/emulator.log" 2>&1 &
    echo $! > "$STATE_DIR/emulator.pid"
    slot_set "$n" "emulator_pid=$!"
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
    [[ -f "$STATE_DIR/metro.pid" ]] || die "port $METRO_PORT already serves a Metro this checkout did not start ($(pid_cwd "$(port_pid "$METRO_PORT")"))"
    echo "metro already up on $METRO_PORT (ours)"
  else
    # Job control gives Metro its own process group, so `down` can stop npx and its node children together.
    mkdir -p "$METRO_TMPDIR"
    set -m
    (cd "$APP_DIR" && CI=1 TMPDIR="$METRO_TMPDIR" nohup npx expo start --dev-client --port "$METRO_PORT" > "$STATE_DIR/metro.log" 2>&1) &
    echo $! > "$STATE_DIR/metro.pid"
    set +m
    slot_set "$n" "metro_pid=$(cat "$STATE_DIR/metro.pid")"
    echo "starting metro on $METRO_PORT..."
    wait_for 120 "metro on $METRO_PORT" metro_up
  fi

  hide_dev_menu_gear
  open_on_metro
  echo "run id: $(cat "$STATE_DIR/run-id")  evidence: $dir"
  echo "next: verify.sh flow $SKILL_DIR/flows/ready.yaml"
}

cmd_doctor() {
  local ok=1
  check() { if "${@:2}" > /dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; ok=0; fi; }
  check "maestro on PATH" command -v maestro
  check "JDK at $JAVA_HOME" test -x "$JAVA_HOME/bin/java"
  check "APK built ($APK)" test -f "$APK"
  local n; n="$(held_slot)"
  if [[ -z "$n" ]]; then
    echo "FAIL this checkout holds no slot; run verify.sh up"
    ok=0
  else
    load_slot "$n"
    echo "ok   slot $n held by this checkout ($AVD, $SERIAL, metro :$METRO_PORT)"
    check "$SERIAL online" emu_online
    if emu_online; then
      local name; name="$(emu_avd_name)"
      if [[ "$name" == "$AVD" ]]; then echo "ok   $SERIAL is AVD $AVD"; else echo "FAIL $SERIAL is AVD '$name', not $AVD"; ok=0; fi
      if [[ -n "$(our_emulator_pid)" ]]; then echo "ok   $SERIAL was started from this checkout"; else echo "FAIL $SERIAL was not started from this checkout"; ok=0; fi
      check "$SERIAL boot completed" booted
      local ver; ver="$(adb_s shell dumpsys package "$APP_ID" 2>/dev/null | grep -m1 versionName | tr -d ' \r' || true)"
      if [[ -n "$ver" ]]; then echo "ok   $APP_ID installed ($ver)"; else echo "FAIL $APP_ID not installed"; ok=0; fi
      check "adb reverse tcp:$METRO_PORT" sh -c "'$ADB' -s $SERIAL reverse --list | grep -q tcp:$METRO_PORT"
      local focus; focus="$(foreground)"
      if [[ "$focus" == *"$APP_ID/.MainActivity"* ]]; then echo "ok   $APP_ID in foreground"; else echo "warn foreground: ${focus:-unknown}"; fi
    fi
    check "metro answering on :$METRO_PORT" metro_up
    if metro_up; then
      # The listener must be the Metro this checkout started, serving this checkout's app/ - otherwise the
      # app is running someone else's code.
      local lpid cwd
      lpid="$(port_pid "$METRO_PORT")"
      cwd="$(pid_cwd "$lpid")"
      if [[ "$cwd" == "$APP_DIR" ]]; then echo "ok   metro serves $APP_DIR"; else echo "FAIL metro (pid $lpid) serves ${cwd:-?}, not $APP_DIR"; ok=0; fi
      # A shared cache can serve another checkout's code even when the cwd is right, so read the TMPDIR
      # the listener actually runs with (ps can show the environment of our own processes).
      local tmp
      tmp="$(ps eww -o command= -p "$lpid" 2>/dev/null | tr ' ' '\n' | sed -n 's/^TMPDIR=//p' | head -1)"
      tmp="${tmp%/}"
      if [[ "$tmp" == "$METRO_TMPDIR" ]]; then
        echo "ok   metro cache in $METRO_TMPDIR/metro-cache"
      else
        echo "FAIL metro cache in ${tmp:-${TMPDIR:-/tmp}}/metro-cache (shared), not $METRO_TMPDIR/metro-cache; run down then up"
        ok=0
      fi
    fi
  fi
  if [[ -f "$STATE_DIR/run-id" ]]; then echo "info run $(cat "$STATE_DIR/run-id") -> $RUNS_DIR/$(cat "$STATE_DIR/run-id")"; fi
  echo "info slots:"
  cmd_slots | sed 's/^/     /'
  if [[ $ok == 1 ]]; then echo "doctor: healthy"; else echo "doctor: NOT healthy"; return 1; fi
}

cmd_flow() { # flow <flow.yaml> [label]
  local flow="${1:?usage: verify.sh flow <flow.yaml> [label]}"
  [[ -f "$flow" ]] || die "no such flow: $flow"
  require_slot
  flow="$(cd "$(dirname "$flow")" && pwd)/$(basename "$flow")"
  local label="${2:-$(basename "$flow" .yaml)}"
  local out; out="$(run_dir)"; out="$out/$(date +%H%M%S)-$label"
  mkdir -p "$out"
  # Run from the output dir so `takeScreenshot` files land next to the maestro report. DEV_URL lets a flow
  # reopen the app on this slot's Metro with `openLink: ${DEV_URL}`.
  local rc=0
  (cd "$out" && maestro --device "$SERIAL" test -e "DEV_URL=$DEV_URL" -e "METRO_PORT=$METRO_PORT" \
    --test-output-dir "$out" "$flow") 2>&1 | tee "$out/maestro.log" || rc=$?
  adb_s exec-out screencap -p > "$out/final.png" || true
  echo "flow $label exit=$rc evidence: $out"
  return "$rc"
}

cmd_shot() {
  require_slot
  local name="${1:-shot}"
  local f; f="$(run_dir)"; f="$f/$(date +%H%M%S)-$name.png"
  adb_s exec-out screencap -p > "$f"
  echo "$f"
}

cmd_ui() { # dump the current screen's view hierarchy (resource-id = RN testID)
  require_slot
  local f; f="$(run_dir)"; f="$f/$(date +%H%M%S)-${1:-ui}"
  # uiautomator dump fails on a screen that never goes idle (a ticking rest timer) or while Maestro's
  # driver holds the accessibility connection, and it leaves the last dump behind, so a failed dump
  # used to print an earlier screen. Clear it first and fall back to Maestro's own hierarchy.
  adb_s shell rm -f /sdcard/verify-ui.xml
  if adb_s shell uiautomator dump /sdcard/verify-ui.xml 2>&1 | grep -q 'dumped to'; then
    f="$f.xml"
    adb_s exec-out cat /sdcard/verify-ui.xml > "$f"
    grep -oE '(text|resource-id|content-desc)="[^"]+"' "$f" | sort -u
  else
    f="$f.json"
    maestro --device "$SERIAL" hierarchy > "$f"
    grep -oE '"(text|resource-id|accessibilityText)" : "[^"]+"' "$f" | sort -u
  fi
  echo "saved $f" >&2
}

cmd_db() { # db "<sql>" - query a snapshot of the app's SQLite database (debug builds allow run-as)
  local sql="${1:?usage: verify.sh db \"<sql>\"}"
  require_slot
  local snap; snap="$(run_dir)"; snap="$snap/db-$(date +%H%M%S)"
  mkdir -p "$snap"
  for f in db.db db.db-wal db.db-shm; do
    adb_s exec-out run-as "$APP_ID" cat "files/SQLite/$f" > "$snap/$f" 2>/dev/null || rm -f "$snap/$f"
  done
  [[ -s "$snap/db.db" ]] || die "could not read files/SQLite/db.db from $APP_ID"
  echo "-- $sql" > "$snap/query.txt"
  sqlite3 -header "$snap/db.db" "$sql" | tee -a "$snap/query.txt"
}

cmd_clear() { # wipe the app's data on this slot's emulator, then reopen it on Metro
  require_slot
  require_our_emulator
  adb_s shell pm clear "$APP_ID" > /dev/null
  echo "cleared $APP_ID data on $SERIAL (slot $SLOT)"
  # pm clear also drops the dev menu's preferences and the remembered Metro URL.
  hide_dev_menu_gear
  open_on_metro
  echo "next: verify.sh flow $SKILL_DIR/flows/ready.yaml"
}

cmd_logs() { # logs [metro|emulator|app]
  case "${1:-metro}" in
    metro) tail -n 80 "$STATE_DIR/metro.log" ;;
    emulator) tail -n 80 "$STATE_DIR/emulator.log" ;;
    app) require_slot; adb_s logcat -d -t 300 ReactNativeJS:V ReactNative:V '*:S' ;;
    *) die "logs: metro|emulator|app" ;;
  esac
}

cmd_down() {
  local n; n="$(held_slot)"
  if [[ -n "${VERIFY_SLOT:-}" && "$VERIFY_SLOT" != "$n" ]]; then
    local owner; owner="$(slot_get "$VERIFY_SLOT" owner)"
    die "slot $VERIFY_SLOT is ${owner:+held by $owner, }not this checkout's; down only stops what this checkout started"
  fi
  if [[ -z "$n" && ! -d "$STATE_DIR" ]]; then
    echo "this checkout holds no slot and started nothing"
    return 0
  fi
  # Without a slot (state from an older verify.sh) fall back to slot 1, the only instance that existed.
  load_slot "${n:-1}"
  if [[ -f "$STATE_DIR/metro.pid" ]]; then
    local mpid; mpid="$(cat "$STATE_DIR/metro.pid")"
    if kill -0 -- "-$mpid" 2>/dev/null; then
      kill -TERM -- "-$mpid" 2>/dev/null || true
      # Metro's cache is inside STATE_DIR, so let it exit before that dir is removed below.
      for _ in $(seq 1 10); do kill -0 -- "-$mpid" 2>/dev/null || break; sleep 1; done
      echo "stopped metro (pgid $mpid)"
    fi
  fi
  local epid; epid="$(our_emulator_pid)"
  if [[ -n "$epid" ]]; then
    if emu_online && [[ "$(emu_avd_name)" == "$AVD" ]]; then
      adb_s reverse --remove-all > /dev/null 2>&1 || true
      adb_s emu kill > /dev/null 2>&1 || true
    fi
    for _ in $(seq 1 30); do kill -0 "$epid" 2>/dev/null || break; sleep 1; done
    if kill -0 "$epid" 2>/dev/null; then kill -TERM "$epid" 2>/dev/null || true; fi
    echo "stopped emulator $SERIAL (pid $epid)"
  fi
  local run=""
  [[ -f "$STATE_DIR/run-id" ]] && run="$RUNS_DIR/$(cat "$STATE_DIR/run-id")"
  rm -rf "$STATE_DIR"
  [[ -n "$n" ]] && with_claim_lock _release
  [[ -n "$run" ]] && echo "evidence kept at $run"
  return 0
}

case "${1:-}" in
  setup | build | up | doctor | slots | flow | shot | ui | db | clear | logs | down | _claim | _release)
    c="$1"; shift; "cmd_$c" "$@" ;;
  *) sed -n '2,4p' "$0"; exit 2 ;;
esac
