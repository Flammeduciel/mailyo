package expo.modules.mailyoimap

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject

/** One mailbox watched with IMAP IDLE. Password XOR OAuth (Gmail). */
data class PushAccount(
  val id: String,
  val email: String,
  val host: String,
  val port: Int,
  val security: String,
  val username: String,
  val password: String?,
  val oauthAccessToken: String?,
  val oauthRefreshToken: String?,
  val oauthClientId: String?,
  val oauthExpiresAt: Long,
) {
  val isOAuth get() = oauthRefreshToken != null || oauthAccessToken != null

  /** Same mailbox and sign-in; a refreshed access token alone does not count as a change. */
  fun sameConnection(other: PushAccount?): Boolean =
    other != null &&
      copy(oauthAccessToken = null, oauthExpiresAt = 0) ==
      other.copy(oauthAccessToken = null, oauthExpiresAt = 0)

  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("email", email).put("host", host).put("port", port)
    .put("security", security).put("username", username)
    .put("password", password).put("oauthAccessToken", oauthAccessToken)
    .put("oauthRefreshToken", oauthRefreshToken).put("oauthClientId", oauthClientId)
    .put("oauthExpiresAt", oauthExpiresAt)

  companion object {
    fun fromJson(o: JSONObject) = PushAccount(
      id = o.getString("id"),
      email = o.optString("email"),
      host = o.getString("host"),
      port = o.optInt("port", 993),
      security = o.optString("security", "ssl"),
      username = o.optString("username"),
      password = o.str("password"),
      oauthAccessToken = o.str("oauthAccessToken"),
      oauthRefreshToken = o.str("oauthRefreshToken"),
      oauthClientId = o.str("oauthClientId"),
      oauthExpiresAt = o.optLong("oauthExpiresAt", 0L),
    )
  }
}

/** Optional string field: null when absent, null or empty. */
private fun JSONObject.str(name: String): String? =
  if (!has(name) || isNull(name)) null else optString(name).ifEmpty { null }

/** Notification preferences the service applies when the app is not running. */
data class PushConfig(
  val accounts: List<PushAccount>,
  /** "full", "sender" or "hidden" (same as the app setting). */
  val contentMode: String,
  /** Quiet hours [start, end) in local hours, or -1 when off. */
  val quietStart: Int,
  val quietEnd: Int,
) {
  fun toJson(): String = JSONObject()
    .put("accounts", JSONArray(accounts.map { it.toJson() }))
    .put("contentMode", contentMode).put("quietStart", quietStart).put("quietEnd", quietEnd)
    .toString()

  companion object {
    fun parse(raw: String?): PushConfig {
      if (raw.isNullOrEmpty()) return PushConfig(emptyList(), "full", -1, -1)
      val o = JSONObject(raw)
      val list = o.optJSONArray("accounts") ?: JSONArray()
      return PushConfig(
        accounts = (0 until list.length()).map { PushAccount.fromJson(list.getJSONObject(it)) },
        contentMode = o.optString("contentMode", "full"),
        quietStart = o.optInt("quietStart", -1),
        quietEnd = o.optInt("quietEnd", -1),
      )
    }
  }
}

/**
 * Service configuration, kept across reboots in encrypted preferences
 * (passwords and tokens never sit in clear text on disk).
 */
class PushConfigStore(context: Context) {
  private val prefs: SharedPreferences = run {
    // security-crypto 1.0.0 API (MasterKey.Builder only exists in 1.1 alphas).
    val keyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    EncryptedSharedPreferences.create(
      "mailyo_push",
      keyAlias,
      context,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  fun load(): PushConfig = runCatching { PushConfig.parse(prefs.getString("config", null)) }
    .getOrDefault(PushConfig(emptyList(), "full", -1, -1))

  fun save(config: PushConfig) {
    prefs.edit().putString("config", config.toJson()).apply()
  }

  fun clear() {
    prefs.edit().clear().apply()
  }

  /** Highest UID already seen per account (to notify mail missed while offline). */
  fun lastSeenUid(accountId: String): Long = prefs.getLong("uid:$accountId", -1L)

  fun setLastSeenUid(accountId: String, uid: Long) {
    prefs.edit().putLong("uid:$accountId", uid).apply()
  }

  fun updateToken(accountId: String, accessToken: String, expiresAt: Long) {
    val config = load()
    save(
      config.copy(
        accounts = config.accounts.map {
          if (it.id == accountId) it.copy(oauthAccessToken = accessToken, oauthExpiresAt = expiresAt) else it
        },
      ),
    )
  }
}
