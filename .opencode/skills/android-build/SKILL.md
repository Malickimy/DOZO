---
name: android-build
description: Build, compile, and unit-test the DOZO Android app (com.example.dozo) via Gradle, surfacing only actionable Kotlin/Gradle errors, warnings, and failing tests. Trigger when the user asks to build, compile, assemble, run tests, or fix Gradle/Kotlin build failures.
---

# android-build

Compiles and tests the DOZO Android app and reduces noisy Gradle output to
the diagnostics that actually need action.

## Command

Run from the project root with the wrapper:

```sh
cd /Users/malicky/l/DOZO/DOZO-App
./gradlew assembleDebug testDebugUnitTest --console=plain
```

- `assembleDebug` builds the debug APK (`app/build/outputs/apk/debug/`).
- `testDebugUnitTest` runs local JVM unit tests.
- `--console=plain` removes progress bars so output is greppable.

Add flags only when needed:

```sh
./gradlew assembleDebug --console=plain --stacktrace   # full stack on crash
./gradlew testDebugUnitTest --console=plain --info     # verbose test output
```

## Parsing the output

Surface only these lines; drop download/progress/config chatter:

```sh
./gradlew assembleDebug testDebugUnitTest --console=plain 2>&1 | \
  grep -E "^(e: |w: |> Task .* FAILED)|FAILURE:|BUILD (SUCCESSFUL|FAILED)|^\s+[0-9]+ tests? (completed|failed)|error:|Execution failed|Caused by:"
```

What matters:

- `e:` / `error:` — Kotlin compile errors. Report file:line and message.
- `w:` — Kotlin warnings; only surface deprecations/unused that relate to the change.
- `> Task ... FAILED` and `Execution failed for task` — the failing Gradle task.
- `FAILURE:` / `BUILD FAILED` — overall result and the first `Caused by:`.

## Summarizing failures

- Report the failing task, the file:line of the first real error, and the
  message. Do not paste the entire log.
- If tests fail, list failing test names and the assertion, then the smallest
  relevant stack frame in `com.example.dozo`.
- Group repeated identical warnings into one line with a count.

## Notes

- Gradle daemon caches; use `./gradlew --stop` if a build hangs.
- `local.properties` supplies `sdk.dir=/Users/malicky/Library/Android/sdk`.
- If no tests exist yet, `testDebugUnitTest` is a no-op; say so rather than
  treating it as a failure.
