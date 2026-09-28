# Contract — Android intent

**Owner:** App (`dozo-app-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

Frozen handoff intent shared with the payment terminal (Fiserv / Ingenico).

- **Activity:** `com.example.dozo/.MainActivity`, `exported=true`, `launchMode=singleTop`, portrait, `configChanges` locked. Handoff uses `startActivityForResult`; relaunch arrives via `onNewIntent`.
- **Actions:** `com.fiserv.intent.action.TRANSACTION_COMPLETE` / `TRANSACTION_CANCELED` / `TRANSACTION_REFUSED`; `com.ingenico.dx8000.action.TRANSACTION_APPROVED` / `TRANSACTION_CANCELED` / `TRANSACTION_REFUSED`.
- **Extras:** `status` (`APPROVED`/`CANCELED`/`REFUSED`, case-insensitive), `merchant_id`, `terminal_id`, `transaction_id`, `amount_cents` (int), `review_url`, `reason`.
- **Status precedence:** `status` wins; without it, only the known approved actions count; a blank `status` falls back to the action. An unknown `status` → silent exit; an absent/unknown action without an approved status falls back to `Idle` (the launcher/config path).
- **QR payload rule:** at QR render the app probes `{redirect_base_url}/health` with an **800 ms** timeout (`DozoContract.HEALTH_PROBE_TIMEOUT_MS`). If the probe succeeds and `terminal_id` is non-blank, the QR encodes `{redirect_base_url}/r/{terminal_id}` (the connector redirect, so scans are recorded). If the probe fails, or `terminal_id` is blank, a static chain is used and the first non-blank value wins: `static_review_url` → a link built from `google_place_id` (`https://search.google.com/local/writereview?placeid=…`) → the intent's `review_url` → the primary connector URL as best effort → `DEFAULT_REVIEW_URL`. Blank values are ignored at every step (`QrPayloadResolver`).
- **Result codes:** `1` approved (`RESULT_APPROVED`). Non-approval and silent exits use `RESULT_CANCELED` (0), the Android default. Every exit calls `setResult(code)` then `finish()`.
- **Approved-only UI:** only an approved transaction shows the QR screen. Canceled / refused / unknown intents render no UI and exit silently in both debug and release.
- **Activation gate:** applies only to transaction handoffs; an approved transaction always returns `1` even when the QR is suppressed by `activated=false` or `display_enabled=false`. Manual/launcher launches always show the UI so a merchant can configure/pair.
