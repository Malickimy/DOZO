package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteConfigPolicyTest {

    @Test
    fun appliesWhenNoQrIsDisplayed() {
        assertEquals(RemoteApplyDecision.Apply, RemoteConfigPolicy.decide(qrDisplayed = false))
    }

    @Test
    fun postponesWhileQrIsDisplayed() {
        assertEquals(RemoteApplyDecision.Postpone, RemoteConfigPolicy.decide(qrDisplayed = true))
    }
}
