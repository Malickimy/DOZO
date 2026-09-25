package com.example.dozo

/** Whether a freshly pulled remote config may be applied now. */
enum class RemoteApplyDecision { Apply, Postpone }

/**
 * Remote-apply gating (App Sprint 4): dashboard wins, but a config pull must
 * never clobber the screen while a transaction QR is on display. The launch-time
 * pull applies immediately when idle and stashes the config while a QR is up.
 */
object RemoteConfigPolicy {

    fun decide(qrDisplayed: Boolean): RemoteApplyDecision =
        if (qrDisplayed) RemoteApplyDecision.Postpone else RemoteApplyDecision.Apply
}
