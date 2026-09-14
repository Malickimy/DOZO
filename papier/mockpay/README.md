# Papier Mock Pay

A mock Polcard/Fiserv payment application used to validate the
`startActivityForResult` handoff into Papier (`com.example.papier/.MainActivity`)
and the numeric result codes it returns.

It is a standalone Android app module (`:mockpay`) and does not modify `:app`.

## Contract

Papier is launched with an explicit component and one of the actions below. All
extras are strings unless noted.

| Outcome  | Action                                          | `status`   | Extra `reason` | Extra `review_url` |
| -------- | ----------------------------------------------- | ---------- | -------------- | ------------------ |
| Approved | `com.fiserv.intent.action.TRANSACTION_COMPLETE` | `APPROVED` | —              | yes                |
| Canceled | `com.fiserv.intent.action.TRANSACTION_CANCELED` | `CANCELED` | yes            | —                  |
| Refused  | `com.fiserv.intent.action.TRANSACTION_REFUSED`  | `REFUSED`  | yes            | —                  |

Common extras: `merchant_id`, `terminal_id`, `transaction_id`, and
`amount_cents` (int). Papier returns a result code via `setResult(code)`:

| Code | Meaning   |
| ---- | --------- |
| 1    | approved  |
| 2    | canceled  |
| 3    | refused   |

An unactivated or silent exit also returns `2` (canceled).

## Build and install

```sh
./gradlew :mockpay:assembleDebug
scripts/mockpay_deploy
```

`scripts/mockpay_deploy` builds `:mockpay:assembleDebug` and runs
`adb install -r mockpay/build/outputs/apk/debug/mockpay-debug.apk`. It honors the
same environment overrides as the other `scripts/` helpers: `PROJECT_DIR`,
`ANDROID_HOME`, `ADB`, `SERIAL`, and `GRADLEW`.

## Use

1. Install and activate Papier (`:app`), then launch **Papier Mock Pay**.
2. Edit `terminal_id`, `merchant_id`, `amount_cents`, `transaction_id`, and the
   optional `review_url` as needed.
3. Tap **Approve**, **Cancel**, or **Refuse**. Mock Pay sends the matching
   intent to Papier and waits for the result.
4. Read the returned code on screen and in logcat:

   ```sh
   adb logcat -s MockPay
   ```

   The activity logs `resultCode=<n> label=<approved|canceled|refused|unexpected>`.

**Manual launch (no extras)** starts Papier with no transaction extras to
exercise the idle/silent-exit path. **Force stop Papier** calls
`ActivityManager.killBackgroundProcesses("com.example.papier")`.
