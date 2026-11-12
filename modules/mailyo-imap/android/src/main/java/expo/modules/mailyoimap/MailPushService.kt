package expo.modules.mailyoimap

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.sun.mail.imap.IMAPFolder
import com.sun.mail.imap.IMAPStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Calendar
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.mail.AuthenticationFailedException
import javax.mail.FetchProfile
import javax.mail.internet.MimeMessage
import javax.mail.Flags
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Session
import javax.mail.UIDFolder
import javax.mail.event.MessageCountAdapter
import javax.mail.event.MessageCountEvent
import javax.mail.internet.InternetAddress

/**
 * « Notifications instantanées »: a foreground service (type remoteMessaging)
 * keeping one IMAP IDLE connection per account. The server tells the phone
 * as soon as mail arrives; the service shows the notification itself when the
 * app is not on screen, and asks the app to sync when it is.
 *
 * Resilience: IDLE is refreshed every 9 minutes (also detects dead
 * connections), reconnects with backoff and on network changes, and mail that
 * arrived while offline is caught up from the last seen UID.
 */
class MailPushService : Service() {
  companion object {
    const val SERVICE_CHANNEL = "mailyo-push"
    const val MAIL_CHANNEL = "mailyo-inbox"
    private const val SERVICE_NOTIFICATION_ID = 7342

    /** The app is on screen: it syncs and notifies, the service stays quiet. */
    @Volatile var appInForeground = false
    @Volatile var running = false

    /** Set by the JS module: (accountId, newCount) -> event to JavaScript. */
    @Volatile var onNewMail: ((String, Int) -> Unit)? = null

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, MailPushService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, MailPushService::class.java))
    }
  }

  private val watchers = ConcurrentHashMap<String, AccountWatcher>()
  private lateinit var store: PushConfigStore
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  @Volatile private var config: PushConfig = PushConfig(emptyList(), "full", -1, -1)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = PushConfigStore(this)
    createChannels()
    val notification = NotificationCompat.Builder(this, SERVICE_CHANNEL)
      .setSmallIcon(smallIcon())
      .setContentTitle("Notifications instantanées")
      .setContentText("MailYo reste à l’écoute de vos nouveaux emails")
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .setShowWhen(false)
      .setContentIntent(launchIntent())
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
    ServiceCompat.startForeground(this, SERVICE_NOTIFICATION_ID, notification, type)
    running = true
    watchNetwork()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    reload()
    return START_STICKY
  }

  /** (Re)apply the stored configuration: start new watchers, stop removed ones. */
  private fun reload() {
    config = store.load()
    if (config.accounts.isEmpty()) {
      stopSelf()
      return
    }
    val wanted = config.accounts.associateBy { it.id }
    for ((id, watcher) in watchers) {
      if (!watcher.account.sameConnection(wanted[id])) {
        watcher.shutdown()
        watchers.remove(id)
      }
    }
    for (account in config.accounts) {
      watchers.computeIfAbsent(account.id) { AccountWatcher(account).also { it.start() } }
    }
  }

  override fun onDestroy() {
    running = false
    watchers.values.forEach { it.shutdown() }
    watchers.clear()
    networkCallback?.let {
      runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    }
    super.onDestroy()
  }

  // -------------------------------------------------------------- network

  /** Network back (or switched): reconnect at once instead of waiting for backoff. */
  private fun watchNetwork() {
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        watchers.values.forEach { it.reconnectNow() }
      }
    }
    runCatching {
      getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(callback)
      networkCallback = callback
    }
  }

  // -------------------------------------------------------- notifications

  private fun createChannels() {
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(SERVICE_CHANNEL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(SERVICE_CHANNEL, "Écoute des nouveaux emails", NotificationManager.IMPORTANCE_MIN).apply {
          description = "Notification discrète obligatoire pendant l’écoute en temps réel"
          setShowBadge(false)
        },
      )
    }
    // Normally created by the app (expo-notifications); created here if the
    // service runs before the app was ever opened after an update.
    if (manager.getNotificationChannel(MAIL_CHANNEL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(MAIL_CHANNEL, "Nouveaux messages", NotificationManager.IMPORTANCE_HIGH),
      )
    }
  }

  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  private fun launchIntent(): PendingIntent? {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun inQuietHours(): Boolean {
    val start = config.quietStart
    val end = config.quietEnd
    if (start < 0 || end < 0 || start == end) return false
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return if (start < end) hour in start until end else hour >= start || hour < end
  }

  /** Tapping opens the conversation of this mail (route `open-mail` in the app). */
  private fun openMailIntent(account: PushAccount, requestCode: Int, messageId: String?, from: String?): PendingIntent? {
    val uri = Uri.Builder().scheme("mailyo").authority("open-mail")
      .appendQueryParameter("account", account.id)
      .apply {
        if (!messageId.isNullOrBlank()) appendQueryParameter("mid", messageId)
        if (!from.isNullOrBlank()) appendQueryParameter("from", from)
      }
      .build()
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    if (intent.resolveActivity(packageManager) == null) return launchIntent()
    return PendingIntent.getActivity(
      this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun notifyMail(
    account: PushAccount,
    uid: Long,
    from: String,
    subject: String,
    messageId: String?,
    fromAddress: String?,
  ) {
    val id = (account.id + ":" + uid).hashCode()
    val (title, text) = when (config.contentMode) {
      "hidden" -> "MailYo" to "Nouveau message"
      "sender" -> from to "Nouveau message"
      else -> from to subject.ifEmpty { "(Sans objet)" }
    }
    val notification: Notification = NotificationCompat.Builder(this, MAIL_CHANNEL)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(text)
      .setSubText(account.email)
      .setCategory(NotificationCompat.CATEGORY_EMAIL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setSilent(inQuietHours())
      .setContentIntent(openMailIntent(account, id, messageId, fromAddress))
      .build()
    runCatching { getSystemService(NotificationManager::class.java).notify(id, notification) }
  }

  // ------------------------------------------------------------- watcher

  /** One IDLE connection on the inbox of one account, on its own thread. */
  private inner class AccountWatcher(val account: PushAccount) : Thread("mailyo-idle-${account.id}") {
    @Volatile private var stopped = false
    @Volatile private var reconnectRequested = false
    @Volatile private var imapStore: IMAPStore? = null
    @Volatile private var folder: IMAPFolder? = null
    @Volatile private var accessToken: String? = account.oauthAccessToken
    @Volatile private var tokenExpiresAt: Long = account.oauthExpiresAt
    private val keepAlive: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val lock = Object()

    init {
      isDaemon = true
      // Ends the current IDLE every 9 minutes (servers drop it after ~29) and
      // proves the connection is alive: a dead one throws and reconnects.
      keepAlive.scheduleWithFixedDelay({
        runCatching { folder?.takeIf { it.isOpen }?.messageCount }.onFailure { reconnectNow() }
      }, 9, 9, TimeUnit.MINUTES)
    }

    fun shutdown() {
      stopped = true
      keepAlive.shutdownNow()
      closeQuietly()
      interrupt()
    }

    /** Drop the connection: the loop reconnects immediately. */
    fun reconnectNow() {
      reconnectRequested = true
      closeQuietly()
      synchronized(lock) { lock.notifyAll() }
    }

    override fun run() {
      var backoff = 5_000L
      while (!stopped) {
        try {
          connect()
          backoff = 5_000L
          val open = folder ?: continue
          while (!stopped && open.isOpen) {
            open.idle(false)
          }
        } catch (e: AuthenticationFailedException) {
          // An expired Gmail token: refresh it and retry quickly; a refused
          // password: retry rarely (the app shows the error when opened).
          if (account.isOAuth && refreshToken()) {
            backoff = 1_000L
          } else {
            backoff = 30 * 60_000L
          }
        } catch (e: Exception) {
          // Network or server error: reconnect with backoff.
        } finally {
          closeQuietly()
        }
        if (stopped) break
        if (reconnectRequested) {
          // Network came back (or keep-alive found a dead link): retry now.
          reconnectRequested = false
          backoff = 5_000L
          continue
        }
        synchronized(lock) { runCatching { lock.wait(backoff) } }
        if (reconnectRequested) {
          reconnectRequested = false
          backoff = 5_000L
        } else {
          backoff = minOf(backoff * 2, 5 * 60_000L)
        }
      }
    }

    private fun connect() {
      if (account.isOAuth && (accessToken == null || System.currentTimeMillis() > tokenExpiresAt - 60_000)) {
        refreshToken()
      }
      val ssl = account.security == "ssl"
      val protocol = if (ssl) "imaps" else "imap"
      val props = Properties().apply {
        put("mail.store.protocol", protocol)
        put("mail.$protocol.connectiontimeout", "20000")
        put("mail.$protocol.timeout", "120000")
        put("mail.$protocol.ssl.checkserveridentity", "true")
        if (account.security == "starttls") {
          put("mail.imap.starttls.enable", "true")
          put("mail.imap.starttls.required", "true")
        }
        if (account.isOAuth) {
          put("mail.$protocol.auth.mechanisms", "XOAUTH2")
          put("mail.$protocol.auth.login.disable", "true")
          put("mail.$protocol.auth.plain.disable", "true")
        }
      }
      val session = Session.getInstance(props)
      val created = session.getStore(protocol) as IMAPStore
      val secret = if (account.isOAuth) accessToken else account.password
      created.connect(account.host, account.port, account.username, secret)
      imapStore = created
      val inbox = created.getFolder("INBOX") as IMAPFolder
      inbox.open(Folder.READ_ONLY)
      folder = inbox
      catchUp(inbox)
      inbox.addMessageCountListener(object : MessageCountAdapter() {
        override fun messagesAdded(e: MessageCountEvent) {
          runCatching { handleNew(inbox, e.messages) }
        }
      })
    }

    /** Mail that arrived while the connection was down. */
    private fun catchUp(inbox: IMAPFolder) {
      val lastSeen = store.lastSeenUid(account.id)
      val next = inbox.uidNext
      if (lastSeen < 0) {
        // First connection: start from now, never notify the whole inbox.
        if (next > 0) store.setLastSeenUid(account.id, next - 1)
        return
      }
      if (next > 0 && next - 1 > lastSeen) {
        val missed = inbox.getMessagesByUID(lastSeen + 1, UIDFolder.LASTUID).filterNotNull()
        handleNew(inbox, missed.takeLast(20).toTypedArray())
      }
    }

    private fun handleNew(inbox: IMAPFolder, messages: Array<Message>) {
      if (messages.isEmpty()) return
      val profile = FetchProfile().apply {
        add(FetchProfile.Item.ENVELOPE)
        add(FetchProfile.Item.FLAGS)
        add(UIDFolder.FetchProfileItem.UID)
      }
      inbox.fetch(messages, profile)
      var lastSeen = store.lastSeenUid(account.id)
      var fresh = 0
      for (message in messages) {
        val uid = inbox.getUID(message)
        if (uid <= lastSeen) continue
        lastSeen = maxOf(lastSeen, uid)
        if (message.isSet(Flags.Flag.SEEN)) continue
        val sender = message.from?.firstOrNull() as? InternetAddress
        if (sender?.address.equals(account.email, ignoreCase = true)) continue
        fresh += 1
        if (!appInForeground) {
          notifyMail(
            account,
            uid,
            sender?.personal ?: sender?.address ?: "Nouveau message",
            message.subject ?: "",
            (message as? MimeMessage)?.messageID,
            sender?.address,
          )
        }
      }
      store.setLastSeenUid(account.id, lastSeen)
      if (fresh > 0) runCatching { onNewMail?.invoke(account.id, fresh) }
    }

    /** Gmail access tokens last an hour: refresh with the stored refresh token. */
    private fun refreshToken(): Boolean {
      val refresh = account.oauthRefreshToken ?: return false
      val clientId = account.oauthClientId ?: return false
      return runCatching {
        val connection = URL("https://oauth2.googleapis.com/token").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.connectTimeout = 20_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        val body = "client_id=${URLEncoder.encode(clientId, "UTF-8")}" +
          "&grant_type=refresh_token&refresh_token=${URLEncoder.encode(refresh, "UTF-8")}"
        connection.outputStream.use { it.write(body.toByteArray()) }
        if (connection.responseCode !in 200..299) return@runCatching false
        val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        val token = json.getString("access_token")
        val expiresAt = System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000
        accessToken = token
        tokenExpiresAt = expiresAt
        store.updateToken(account.id, token, expiresAt)
        true
      }.getOrDefault(false)
    }

    private fun closeQuietly() {
      runCatching { folder?.takeIf { it.isOpen }?.close(false) }
      runCatching { imapStore?.close() }
      folder = null
      imapStore = null
    }
  }
}
