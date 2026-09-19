---
name: adb-diagnostics
description: Pull and triage Android logcat from the emulator to surface fatal exceptions, crashes, lifecycle transitions, and ANRs for com.example.dozo. Trigger when the user asks to debug a crash, ANR, stack trace, or wants logcat output.
---

# adb-diagnostics

Dumps the current logcat buffer and reduces it to the crash/ANR evidence that
matters for the DOZO app (`com.example.dozo`).

## Command

Plain `adb` on PATH, or the explicit SDK path:

```sh
adb logcat -d -t 150 '*:E'
```

```sh
$ANDROID_HOME/platform-tools/adb logcat -d -t 150 '*:E'
```

- `-d` dump the buffer and exit (no follow).
- `-t 150` last 150 lines.
- `'*:E'` only Error level and above. **Quote it** — in zsh an unquoted
  `*:E` triggers `no matches found` and the command never runs.

`dozo_adb` (fish helper) is an alternative if it wraps the same binary.

## Variants

Timestamps + pid/tid to correlate with UI actions:

```sh
adb logcat -d -v threadtime -t 300
```

Filter to the app only (pid-scoped, catches its non-error logs too):

```sh
PID=$(adb shell pidof -s com.example.dozo)
[ -n "$PID" ] && adb logcat -d -t 300 --pid="$PID" || echo "com.example.dozo not running"
```

Crash / ANR markers only:

```sh
adb logcat -d -t 500 | grep -E "FATAL EXCEPTION|ANR in|beginning of crash|E/AndroidRuntime"
```

Full crash buffer including earlier context:

```sh
adb logcat -d -b crash -t 200
```

Clear before reproducing, then dump:

```sh
adb logcat -c
# ...trigger the flow...
adb logcat -d -t 200
```

## Triage

- `FATAL EXCEPTION` / `E/AndroidRuntime` — report exception type, message, and
  the first `at com.example.dozo...` frame.
- `ANR in com.example.dozo` — report the reason and main-thread blocking frame.
- Lifecycle transitions — look for `ActivityManager` lines around the failure
  (onCreate/onResume/onPause) to place the crash in a transition.
- Ignore framework noise (SurfaceFlinger, vendor daemons) unless it names the app.

## Notes

- Emulator AVD: `Ingenico_AXIUM_DX8000`; boot with `dozo_boot` if absent.
- Verify the device is present first: `adb devices`.
