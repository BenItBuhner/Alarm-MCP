package dev.alarmmcp.android

import dev.convex.android.ConvexClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

data class Capabilities(
    val sound: Boolean,
    val vibrate: Boolean,
    val fullScreen: Boolean,
    val speak: Boolean,
    val actions: Boolean,
) {
    fun toArgs(): Map<String, Any?> = mapOf(
        "sound" to sound,
        "vibrate" to vibrate,
        "fullScreen" to fullScreen,
        "speak" to speak,
        "actions" to actions,
    )
}

/**
 * Typed wrapper over the backend's device-facing functions. Optional arguments are omitted rather
 * than sent as null because Convex `v.optional` validators reject null, and numbers are passed as
 * Double because the client encodes Int/Long as int64, which `v.number()` rejects.
 *
 * Every call runs on Dispatchers.IO: the Rust client resumes continuations from inside its own poll,
 * and resuming inline on Dispatchers.Main.immediate re-enters it and deadlocks the main thread.
 */
class DeviceApi(val client: ConvexClient, private val deviceToken: String) {
    fun feed(): Flow<Result<Feed>> =
        client.subscribe<Feed>("deviceApi:feed", mapOf("deviceToken" to deviceToken)).flowOn(Dispatchers.IO)

    suspend fun heartbeat(pushToken: String?, appVersion: String, capabilities: Capabilities): Unit = withContext(Dispatchers.IO) {
        val args = mutableMapOf<String, Any?>(
            "deviceToken" to deviceToken,
            "appVersion" to appVersion,
            "capabilities" to capabilities.toArgs(),
        )
        if (pushToken != null) args["pushToken"] = pushToken
        client.mutation("deviceApi:heartbeat", args)
    }

    suspend fun markSeen(deliveryId: String): Unit = withContext(Dispatchers.IO) {
        client.mutation("deviceApi:markSeen", mapOf("deviceToken" to deviceToken, "deliveryId" to deliveryId))
    }

    suspend fun respond(response: PendingResponse): Unit = withContext(Dispatchers.IO) {
        val args = mutableMapOf<String, Any?>(
            "deviceToken" to deviceToken,
            "alarmId" to response.alarmId,
            "action" to response.action.wireName,
        )
        response.option?.let { args["option"] = it }
        response.snoozeMinutes?.let { args["snoozeMinutes"] = it }
        client.mutation("deviceApi:respond", args)
    }

    suspend fun signOut(): Unit = withContext(Dispatchers.IO) {
        client.mutation("deviceApi:signOut", mapOf("deviceToken" to deviceToken))
    }
}
