package com.example.dozo

const val RESULT_APPROVED: Int = 1

object DozoContract {
    const val ACTION_FISERV = "com.fiserv.intent.action.TRANSACTION_COMPLETE"
    const val ACTION_INGENICO = "com.ingenico.dx8000.action.TRANSACTION_APPROVED"
    const val ACTION_FISERV_CANCELED = "com.fiserv.intent.action.TRANSACTION_CANCELED"
    const val ACTION_INGENICO_CANCELED = "com.ingenico.dx8000.action.TRANSACTION_CANCELED"
    const val ACTION_FISERV_REFUSED = "com.fiserv.intent.action.TRANSACTION_REFUSED"
    const val ACTION_INGENICO_REFUSED = "com.ingenico.dx8000.action.TRANSACTION_REFUSED"

    const val EXTRA_STATUS = "status"
    const val EXTRA_MERCHANT_ID = "merchant_id"
    const val EXTRA_TERMINAL_ID = "terminal_id"
    const val EXTRA_TXN_ID = "transaction_id"
    const val EXTRA_AMOUNT_CENTS = "amount_cents"
    const val EXTRA_REVIEW_URL = "review_url"
    const val EXTRA_REASON = "reason"

    const val STATUS_APPROVED = "APPROVED"
    const val STATUS_CANCELED = "CANCELED"
    const val STATUS_REFUSED = "REFUSED"

    const val DEFAULT_REVIEW_URL = "https://g.page/r/EXAMPLE/review"
    const val DEFAULT_TXN_ID = "TXN-UNKNOWN"

    const val PREFS_NAME = "dozo_prefs"
    const val KEY_ACTIVATED = "activated"
    const val KEY_DISPLAY_ENABLED = "display_enabled"
    const val KEY_REDIRECT_BASE_URL = "redirect_base_url"
    const val KEY_DISPLAY_TIMEOUT_SECONDS = "display_timeout_seconds"
    const val KEY_API_BASE_URL = "api_base_url"
    const val KEY_API_TOKEN = "api_token"
    const val KEY_TERMINAL_ID = "terminal_id"
    const val KEY_MERCHANT_ID = "merchant_id"
    const val KEY_PAIRING_CODE = "pairing_code"
    const val KEY_PIN = "pin"

    const val DEFAULT_REDIRECT_BASE_URL = "http://130.162.185.144:3000"
    const val DEFAULT_DISPLAY_TIMEOUT_SECONDS = 15
    const val MIN_DISPLAY_TIMEOUT_SECONDS = 5
    const val MAX_DISPLAY_TIMEOUT_SECONDS = 30
    const val DEFAULT_API_BASE_URL = "http://130.162.185.144:3000"
    const val DEFAULT_API_TOKEN = "dev-placeholder-token"
    const val DEFAULT_MERCHANT_ID = "demo-merchant"
    const val DEFAULT_PIN = "0000"
}
