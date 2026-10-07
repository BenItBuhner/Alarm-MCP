package dev.alarmmcp.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object ConvexHttp {
    suspend fun register(
        convexUrl: String,
        clerkJwt: String,
        name: String,
        installationId: String,
        capabilities: Capabilities,
        appVersion: String,
        defaultIntensity: Intensity,
    ): PairResult = withContext(Dispatchers.IO) {
        val args = JSONObject()
            .put("installationId", installationId)
            .put("name", name)
            .put("platform", "android")
            .put("appVersion", appVersion)
            .put("defaultIntensity", defaultIntensity.wireName)
            .put("capabilities", JSONObject(capabilities.toArgs()))
        val body = JSONObject()
            .put("path", "devices:register")
            .put("args", args)
            .put("format", "json")
            .toString()
        val url = URL("${convexUrl.trimEnd('/')}/api/action")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Authorization", "Bearer $clerkJwt")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Convex-Client", "android-custom-0.1.0")
            connectTimeout = 15_000
            readTimeout = 20_000
            doInput = true
            doOutput = true
            outputStream.use { it.write(body.toByteArray()) }
        }
        val text = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream)
            .bufferedReader().use { it.readText() }
        val payload = JSONObject(text.ifBlank { "{}" })
        if (payload.optString("status") == "error" || connection.responseCode !in 200..299) {
            throw IllegalStateException(payload.optString("errorMessage").ifBlank { "Register failed" })
        }
        val value = payload.optJSONObject("value") ?: payload
        PairResult(
            deviceId = value.getString("deviceId"),
            deviceToken = value.getString("deviceToken"),
            userName = value.optString("userName").ifBlank { null },
        )
    }
}
