package com.example.dozo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class RegisterResult(
    val code: String,
    val terminalId: String,
    val expiresAt: String,
    val expiresInSeconds: Int
)

data class StoreConfig(
    val terminalId: String,
    val merchantId: String,
    val googlePlaceId: String?,
    val label: String?,
    val redirectUrl: String
)

data class TerminalConfig(
    val terminalId: String,
    val merchantId: String,
    val googlePlaceId: String?,
    val label: String?,
    val active: Boolean,
    val displayEnabled: Boolean,
    val displayTimeoutSeconds: Int,
    val redirectBaseUrl: String
)

sealed interface PairStatusResult {
    data class Pending(val code: String, val expiresAt: String) : PairStatusResult
    data class Claimed(val apiToken: String, val store: StoreConfig) : PairStatusResult
    data class Expired(val code: String) : PairStatusResult
    data object Unknown : PairStatusResult
}

sealed interface ConfigResult {
    data class Success(val config: TerminalConfig) : ConfigResult
    data object NotFound : ConfigResult
    data object Unauthorized : ConfigResult
    data object Failed : ConfigResult
}

sealed interface RedeemResult {
    data class Success(val apiToken: String, val store: StoreConfig) : RedeemResult
    data object Invalid : RedeemResult
    data object Unknown : RedeemResult
    data object Expired : RedeemResult
    data object AlreadyRedeemed : RedeemResult
    data object Failed : RedeemResult
}

class DozoApi(
    private val baseUrl: String,
    private val apiToken: String
) {

    suspend fun register(
        deviceSerial: String,
        merchantId: String,
        terminalId: String
    ): RegisterResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("device_serial", deviceSerial)
            .put("merchant_id", merchantId)
            .put("terminal_id", terminalId)
            .toString()
        parseRegister(post("/api/terminals/register", body))
    }

    suspend fun pairStatus(code: String): PairStatusResult = withContext(Dispatchers.IO) {
        val response = request("/api/terminals/pair-status/$code", "GET", null)
        parsePairStatus(response.code, response.body)
    }

    suspend fun heartbeat(terminalId: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("terminal_id", terminalId).toString()
        val response = request("/api/heartbeat", "POST", body)
        response.code == HTTP_OK && parseHeartbeat(response.body)
    }

    suspend fun config(terminalId: String): ConfigResult = withContext(Dispatchers.IO) {
        val response = request("/api/terminals/$terminalId/config", "GET", null)
        parseConfigResponse(response.code, response.body)
    }

    suspend fun redeem(code: String, deviceSerial: String): RedeemResult =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("code", code.trim().uppercase())
                .put("device_serial", deviceSerial)
                .toString()
            val response = request("/api/terminals/redeem", "POST", body)
            parseRedeem(response.code, response.body)
        }

    private fun post(path: String, body: String): String =
        request(path, "POST", body).body

    private fun request(path: String, method: String, body: String?): HttpResponse {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        return try {
            connection.requestMethod = method
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("X-Api-Token", apiToken)
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            HttpResponse(code, responseBody)
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResponse(val code: Int, val body: String)

    private companion object {
        const val TIMEOUT_MS = 10_000
        const val HTTP_OK = 200
    }
}

fun parseRegister(body: String): RegisterResult {
    val json = JSONObject(body)
    return RegisterResult(
        code = json.getString("code"),
        terminalId = json.getString("terminal_id"),
        expiresAt = json.optString("expires_at"),
        expiresInSeconds = json.optInt("expires_in_seconds", 0)
    )
}

fun parsePairStatus(httpStatus: Int, body: String): PairStatusResult {
    val json = runCatching { JSONObject(body) }.getOrNull()
    val status = json?.optString("status").orEmpty()
    return when {
        httpStatus == HTTP_NOT_FOUND || status == "unknown" -> PairStatusResult.Unknown
        httpStatus == HTTP_GONE || status == "expired" ->
            PairStatusResult.Expired(json?.optString("code").orEmpty())
        httpStatus == HTTP_OK && json != null -> PairStatusResult.Claimed(
            apiToken = json.optString("api_token"),
            store = parseStore(json.optJSONObject("store"))
        )
        else -> PairStatusResult.Pending(
            code = json?.optString("code").orEmpty(),
            expiresAt = json?.optString("expires_at").orEmpty()
        )
    }
}

fun parseStore(json: JSONObject?): StoreConfig = StoreConfig(
    terminalId = json?.optString("terminal_id").orEmpty(),
    merchantId = json?.optString("merchant_id").orEmpty(),
    googlePlaceId = json?.optString("google_place_id").orEmpty().takeIf { it.isNotBlank() },
    label = json?.optString("label").orEmpty().takeIf { it.isNotBlank() },
    redirectUrl = json?.optString("redirect_url").orEmpty()
)

fun parseHeartbeat(body: String): Boolean =
    runCatching { JSONObject(body).optBoolean("ok", false) }.getOrDefault(false)

fun parseConfigResponse(httpStatus: Int, body: String): ConfigResult = when {
    httpStatus == HTTP_OK -> parseTerminalConfig(body)
        ?.let { ConfigResult.Success(it) }
        ?: ConfigResult.Failed
    httpStatus == HTTP_UNAUTHORIZED -> ConfigResult.Unauthorized
    httpStatus == HTTP_NOT_FOUND -> ConfigResult.NotFound
    else -> ConfigResult.Failed
}

fun parseRedeem(httpStatus: Int, body: String): RedeemResult {
    val json = runCatching { JSONObject(body) }.getOrNull()
    val status = json?.optString("status").orEmpty()
    val error = json?.optString("error").orEmpty()
    return when {
        httpStatus == HTTP_OK && status == "redeemed" && json != null -> RedeemResult.Success(
            apiToken = json.optString("api_token"),
            store = parseStore(json.optJSONObject("store"))
        )
        httpStatus == HTTP_BAD_REQUEST -> RedeemResult.Invalid
        httpStatus == HTTP_NOT_FOUND || error == "unknown_code" -> RedeemResult.Unknown
        httpStatus == HTTP_GONE && error == "redeemed_code" -> RedeemResult.AlreadyRedeemed
        httpStatus == HTTP_GONE || error == "expired_code" -> RedeemResult.Expired
        else -> RedeemResult.Failed
    }
}

fun parseTerminalConfig(body: String): TerminalConfig? {
    val json = runCatching { JSONObject(body) }.getOrNull() ?: return null
    val terminalId = json.optString("terminal_id")
    if (terminalId.isBlank()) return null
    return TerminalConfig(
        terminalId = terminalId,
        merchantId = json.optString("merchant_id"),
        googlePlaceId = json.optString("google_place_id").takeIf { it.isNotBlank() },
        label = json.optString("label").takeIf { it.isNotBlank() },
        active = json.optBooleanLoose("active", true),
        displayEnabled = json.optBooleanLoose("display_enabled", true),
        displayTimeoutSeconds = json.optInt(
            "display_timeout_seconds",
            DozoContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
        ),
        redirectBaseUrl = json.optString("redirect_base_url")
    )
}

private fun JSONObject.optBooleanLoose(key: String, default: Boolean): Boolean =
    when (val value = opt(key)) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> value.equals("true", ignoreCase = true) || value == "1"
        else -> default
    }

fun deriveRedirectBaseUrl(redirectUrl: String, terminalId: String): String {
    val suffix = "/r/$terminalId"
    return if (redirectUrl.endsWith(suffix)) redirectUrl.removeSuffix(suffix) else redirectUrl
}

private const val HTTP_OK = 200
private const val HTTP_BAD_REQUEST = 400
private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_NOT_FOUND = 404
private const val HTTP_GONE = 410
