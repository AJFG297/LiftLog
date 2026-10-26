import datetime, json, pathlib, re, subprocess, sys, time
root = pathlib.Path(__file__).parent
label, seconds = sys.argv[1], int(sys.argv[2])
adb = ['/Users/aidanbuzzaroo/Library/Android/sdk/platform-tools/adb', '-s', 'emulator-5584']
audio = (root / f'{label}-audio.log').open('w')
log = subprocess.Popen(adb + ['logcat', '-v', 'threadtime', '-T', '1', '-s', 'NotificationService', 'RingtonePlayer', 'AudioService', 'AudioFlinger', 'MediaPlayer', 'WorkoutUpdatedHandler', 'RepeatingTimerAction', 'HeadphoneAlertPlayer'], stdout=audio, stderr=subprocess.STDOUT)
creations = set()
shot = False
started = time.monotonic()
try:
    while time.monotonic() - started < seconds:
        dump = subprocess.check_output(adb + ['shell', 'dumpsys', 'notification', '--noredact'], text=True)
        active = dump.split('  Notification List:', 1)[-1].split('  Enqueued Notification List:', 1)[0]
        records = re.split(r'(?=^    NotificationRecord\()', active, flags=re.M)
        samples = []
        for record in records:
            first = record.splitlines()[0] if record.splitlines() else ''
            if 'pkg=com.ajfg297.liftlog ' not in first:
                continue
            notification_id = re.search(r' id=(\d+) ', first).group(1)
            if notification_id not in ('123', '1234'):
                continue
            fields = dict(re.findall(r'android\.(title|text|subText|shortCriticalText)=String \(([^\n]*)\)', record))
            fields['id'] = notification_id
            fields['flags'] = re.search(r'^      flags=(.*)$', record, re.M).group(1)
            samples.append(fields)
            if notification_id == '1234':
                creation = re.search(r'mCreationTimeMs=(\d+)', record)
                if creation:
                    creations.add(creation.group(1))
                (root / f'{label}-alert.txt').write_text(dump)
                if label in ('fixed-locked', 'fixed-secure-locked') and not shot:
                    subprocess.run(adb + ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], check=True)
                    time.sleep(1)
                    with (root / f'{label}-alert.png').open('wb') as picture:
                        subprocess.run(adb + ['exec-out', 'screencap', '-p'], stdout=picture, check=True)
                    shot = True
        print(json.dumps({'elapsed': round(time.monotonic() - started, 1), 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'notifications': samples}), flush=True)
        (root / f'{label}-latest.txt').write_text(dump)
        time.sleep(2)
finally:
    log.terminate()
    log.wait(timeout=10)
    audio.close()
print(json.dumps({'completion_notification_creations': sorted(creations)}), flush=True)
