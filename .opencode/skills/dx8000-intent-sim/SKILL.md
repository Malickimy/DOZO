---
name: dx8000-intent-sim
description: Fire synthetic Fiserv/PoC payment-result intents at com.example.dozo.MainActivity on the DX8000 emulator to drive UI state transitions for approved, canceled, and refused outcomes. Trigger when the user asks to simulate a payment approval, cancellation, or refusal, inject a transaction intent, or test the app's approval/QR or status-screen flow.
---

# dx8000-intent-sim

Launches `com.example.dozo/.MainActivity` with payment-result extras so the
app advances its transaction UI without a real terminal.

## Intent actions (outcome × provider)

| Outcome  | Fiserv                                    | PoC (Ingenico)                                  |
| -------- | ----------------------------------------- | ----------------------------------------------- |
| Approved | `com.fiserv.intent.action.TRANSACTION_COMPLETE` | `com.ingenico.dx8000.action.TRANSACTION_APPROVED` |
| Canceled | `com.fiserv.intent.action.TRANSACTION_CANCELED` | `com.ingenico.dx8000.action.TRANSACTION_CANCELED` |
| Refused  | `com.fiserv.intent.action.TRANSACTION_REFUSED`  | `com.ingenico.dx8000.action.TRANSACTION_REFUSED`  |

## Extras

| Extra            | Type   | Notes                                       |
| ---------------- | ------ | ------------------------------------------- |
| `transaction_id` | String | Transaction identifier.                     |
| `amount_cents`   | Int    | Amount in cents.                            |
| `review_url`     | String | Approved only; ignored for canceled/refused.|
| `reason`         | String | Optional; describes a canceled/refused result. |

## Helper CLI

`dx8000_trigger_intent` (on `PATH`) selects the outcome with `--approved`
(default), `--canceled`, or `--refused`, and the provider with `--poc`.
Other flags: `--txn`, `--amount`, `--url`, `--reason`.

```sh
# Approved (Fiserv, default; --approved is explicit)
dx8000_trigger_intent --approved --txn TXN-123456 --amount 1999 --url "https://g.page/r/EXAMPLE/review"

# Approved via PoC action
dx8000_trigger_intent --poc --txn TXN-123456 --amount 1999 --url "https://g.page/r/EXAMPLE/review"

# Canceled
dx8000_trigger_intent --canceled --txn TXN-123456 --amount 1999 --reason "Cashier void"

# Refused
dx8000_trigger_intent --refused --txn TXN-123456 --amount 1999 --reason "Insufficient funds"
```

## Raw `adb shell am start`

Approved (Fiserv):

```sh
adb shell am start \
  -n com.example.dozo/.MainActivity \
  -a com.fiserv.intent.action.TRANSACTION_COMPLETE \
  --es transaction_id "TXN-123456" \
  --ei amount_cents 1999 \
  --es review_url "https://g.page/r/EXAMPLE/review"
```

Canceled:

```sh
adb shell am start \
  -n com.example.dozo/.MainActivity \
  -a com.fiserv.intent.action.TRANSACTION_CANCELED \
  --es transaction_id "TXN-123456" \
  --ei amount_cents 1999 \
  --es reason "Cashier void"
```

Refused:

```sh
adb shell am start \
  -n com.example.dozo/.MainActivity \
  -a com.fiserv.intent.action.TRANSACTION_REFUSED \
  --es transaction_id "TXN-123456" \
  --ei amount_cents 1999 \
  --es reason "Insufficient funds"
```

For a PoC outcome, swap the `-a` value for the matching
`com.ingenico.dx8000.action.TRANSACTION_*` action. To force a fresh task,
`adb shell am force-stop com.example.dozo` first, or add
`-f 0x10000000` (`FLAG_ACTIVITY_NEW_TASK`; `0x20000000` is
`FLAG_ACTIVITY_SINGLE_TOP`). Extra flags: `--es` String, `--ei` int, `--ez`
boolean, `--el`/`--ef` long/float.

## Behaviour

- Approved renders the review QR (~15s). Canceled/refused render a
  "Transaction canceled" / "Transaction refused" status screen with no QR
  (~10s), then exit via `finishAndRemoveTask()`; tapping Done dismisses sooner.
- `MainActivity` uses `singleTask`, so an already-running instance updates in
  place via `onNewIntent`; `force-stop` first for a cold start.

## Verify

Check the rendered outcome text without looking at the screen:

```sh
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml | grep -i -E "canceled|refused"
```

- `dx8000_verify_qr` should PASS only for approved; it must FAIL for
  canceled/refused (no QR is rendered).
- Watch logs: `adb logcat -d -t 100 | grep com.example.dozo`.
- Confirm device: `adb devices` (AVD `Ingenico_AXIUM_DX8000`, boot `dx8000_boot`).
