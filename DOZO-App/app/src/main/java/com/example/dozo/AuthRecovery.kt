package com.example.dozo

/**
 * R6 re-pair trigger: a `401` from the dashboard means the per-terminal token is
 * no longer valid, so the app drops the stored token and sends the operator back
 * through the setup-code flow. Pure so the decision is JVM-testable.
 */
object AuthRecovery {

    fun shouldClearToken(result: HeartbeatResult): Boolean =
        result is HeartbeatResult.Unauthorized

    fun shouldClearToken(result: ConfigResult): Boolean =
        result is ConfigResult.Unauthorized
}
