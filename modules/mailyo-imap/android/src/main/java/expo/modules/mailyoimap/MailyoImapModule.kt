package expo.modules.mailyoimap

import android.util.Base64
import com.sun.mail.imap.IMAPFolder
import com.sun.mail.imap.IMAPMessage
import com.sun.mail.imap.IMAPStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Date
import java.util.Properties
import java.util.concurrent.ConcurrentHashMap
import javax.mail.Address
import javax.mail.AuthenticationFailedException
import javax.mail.FetchProfile
import javax.mail.Flags
import javax.mail.Folder
import javax.mail.Message
import javax.mail.MessagingException
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Transport
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeUtility

/** Connection settings of one server (IMAP or SMTP), sent from JavaScript. */
class ServerConfig : Record {
  @Field var host: String = ""
  @Field var port: Int = 993
  /** "ssl" (implicit TLS), "starttls" or "none". */
  @Field var security: String = "ssl"
  @Field var username: String = ""
  @Field var password: String = ""
}

class MailError(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

/**
 * IMAP + SMTP for MailYo, on top of JavaMail for Android. Every call is a
 * coroutine on the IO dispatcher; IMAP stores are cached per account and
 * reconnected when the server dropped them.
 */
class MailyoImapModule : Module() {
  private val stores = ConcurrentHashMap<String, IMAPStore>()
  private val locks = ConcurrentHashMap<String, Mutex>()

  override fun definition() = ModuleDefinition {
    Name("MailyoImap")

    /** New mail seen by the real-time service: { accountId, count }. */
    Events("onNewMail")

    OnCreate {
      MailPushService.onNewMail = { accountId, count ->
        sendEvent("onNewMail", mapOf("accountId" to accountId, "count" to count))
      }
    }

    OnDestroy {
      MailPushService.onNewMail = null
    }

    /**
     * Start (or update) « Notifications instantanées » with the accounts to
     * watch. The configuration is stored encrypted so the service survives
     * reboots; an empty account list stops it.
     */
    Function("startPush") { configJson: String ->
      val context = requireContext()
      val config = PushConfig.parse(configJson)
      val store = PushConfigStore(context)
      store.save(config)
      if (config.accounts.isEmpty()) {
        MailPushService.stop(context)
      } else {
        MailPushService.start(context)
      }
      true
    }

    Function("stopPush") {
      val context = requireContext()
      PushConfigStore(context).clear()
      MailPushService.stop(context)
      true
    }

    /** The app tells the service whether it is on screen (then the app notifies). */
    Function("setAppForeground") { foreground: Boolean ->
      MailPushService.appInForeground = foreground
      true
    }

    Function("pushStatus") {
      val context = requireContext()
      mapOf(
        "running" to MailPushService.running,
        "accounts" to PushConfigStore(context).load().accounts.map { it.email },
        "batteryUnrestricted" to isIgnoringBatteryOptimizations(context),
      )
    }

    /** Opens the system screen where MailYo can be exempted from battery optimisation. */
    Function("openBatterySettings") {
      val context = requireContext()
      val intent = android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(intent) }.isSuccess
    }

    /** Log in to IMAP and SMTP; throws AUTH / CONNECT errors with a readable message. */
    AsyncFunction("testConnection") Coroutine { imap: ServerConfig, smtp: ServerConfig ->
      io {
        withStore(imap) { store -> store.getFolder("INBOX").exists() }
        val transport = smtpSession(smtp).getTransport("smtp")
        try {
          transport.connect(smtp.host, smtp.port, smtp.username, smtp.password)
        } catch (e: AuthenticationFailedException) {
          throw MailError("AUTH", "SMTP : identifiant ou mot de passe refusé", e)
        } catch (e: MessagingException) {
          throw MailError("CONNECT", "SMTP : connexion impossible (${e.message})", e)
        } finally {
          runCatching { transport.close() }
        }
        true
      }
    }

    /** Every selectable folder with its SPECIAL-USE attributes (\Sent, \Junk…). */
    AsyncFunction("listFolders") Coroutine { imap: ServerConfig ->
      io {
        withStore(imap) { store ->
          store.defaultFolder.list("*")
            .filterIsInstance<IMAPFolder>()
            .filter { (it.type and Folder.HOLDS_MESSAGES) != 0 }
            .map { folder ->
              mapOf(
                "fullName" to folder.fullName,
                "name" to folder.name,
                "attributes" to folder.attributes.toList(),
              )
            }
        }
      }
    }

    /**
     * New mail of a folder. Initial sync (lastUid < 0): the newest `limit`
     * messages. Otherwise every UID above lastUid, oldest first, capped.
     */
    AsyncFunction("fetchMessages") Coroutine { imap: ServerConfig, folderName: String, lastUid: Double, limit: Int ->
      io {
        withFolder(imap, folderName) { folder ->
          val uidValidity = folder.uidValidity
          val messages: Array<Message> = if (lastUid < 0) {
            val count = folder.messageCount
            if (count == 0) emptyArray() else folder.getMessages(maxOf(1, count - limit + 1), count)
          } else {
            folder.getMessagesByUID(lastUid.toLong() + 1, UIDFolder.LASTUID)
              .filter { folder.getUID(it) > lastUid.toLong() }
              .take(limit)
              .toTypedArray()
          }
          mapOf("uidValidity" to uidValidity.toDouble(), "messages" to describe(folder, messages))
        }
      }
    }

    /** Up to `limit` messages just below `beforeUid` (infinite scroll), newest first. */
    AsyncFunction("fetchOlder") Coroutine { imap: ServerConfig, folderName: String, beforeUid: Double, limit: Int ->
      io {
        withFolder(imap, folderName) { folder ->
          val before = beforeUid.toLong()
          if (before <= 1) return@withFolder emptyList<Map<String, Any?>>()
          val candidates = folder.getMessagesByUID(maxOf(1, before - limit * 4L), before - 1)
            .filterNotNull()
            .sortedByDescending { folder.getUID(it) }
            .take(limit)
          describe(folder, candidates.toTypedArray())
        }
      }
    }

    /** Set or clear \Seen ("seen") or \Flagged ("flagged") on one message. */
    AsyncFunction("setFlag") Coroutine { imap: ServerConfig, folderName: String, uid: Double, flag: String, value: Boolean ->
      io {
        withFolder(imap, folderName, Folder.READ_WRITE) { folder ->
          val message = folder.getMessageByUID(uid.toLong()) ?: return@withFolder false
          val target = if (flag == "flagged") Flags.Flag.FLAGGED else Flags.Flag.SEEN
          message.setFlag(target, value)
          true
        }
      }
    }

    /** Move a message to another folder (MOVE when supported, else COPY + delete). */
    AsyncFunction("moveMessage") Coroutine { imap: ServerConfig, fromFolder: String, uid: Double, toFolder: String ->
      io {
        withFolder(imap, fromFolder, Folder.READ_WRITE) { folder ->
          val message = folder.getMessageByUID(uid.toLong()) ?: return@withFolder false
          val target = folder.store.getFolder(toFolder)
          if (!target.exists()) throw MailError("NO_FOLDER", "Dossier introuvable : $toFolder")
          try {
            folder.moveMessages(arrayOf(message), target)
          } catch (e: MessagingException) {
            folder.copyMessages(arrayOf(message), target)
            message.setFlag(Flags.Flag.DELETED, true)
            folder.expunge(arrayOf(message))
          }
          true
        }
      }
    }

    /** Raw bytes (base64) of one attachment, addressed by its MIME part path ("2", "1.3"…). */
    AsyncFunction("downloadAttachment") Coroutine { imap: ServerConfig, folderName: String, uid: Double, partPath: String ->
      io {
        withFolder(imap, folderName) { folder ->
          val message = folder.getMessageByUID(uid.toLong())
            ?: throw MailError("NOT_FOUND", "Message introuvable sur le serveur")
          val part = findPart(message, partPath)
            ?: throw MailError("NOT_FOUND", "Pièce jointe introuvable")
          val out = ByteArrayOutputStream()
          part.inputStream.use { it.copyTo(out) }
          Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }
      }
    }

    /** A few raw headers of one message (List-Unsubscribe backfill…). */
    AsyncFunction("fetchHeaders") Coroutine { imap: ServerConfig, folderName: String, uid: Double, names: List<String> ->
      io {
        withFolder(imap, folderName) { folder ->
          val message = folder.getMessageByUID(uid.toLong()) ?: return@withFolder emptyMap<String, String?>()
          names.associateWith { name -> message.getHeader(name)?.firstOrNull() }
        }
      }
    }

    /**
     * Send a complete RFC 5322 message (base64, built in JavaScript) through
     * SMTP, then append a copy to the Sent folder when one is given.
     */
    AsyncFunction("sendRaw") Coroutine { smtp: ServerConfig, rawBase64: String, recipients: List<String>, imap: ServerConfig?, sentFolder: String? ->
      io {
        val session = smtpSession(smtp)
        val bytes = Base64.decode(rawBase64, Base64.DEFAULT)
        val message = MimeMessage(session, ByteArrayInputStream(bytes))
        if (message.sentDate == null) message.sentDate = Date()
        val envelope: Array<Address> = recipients.map { InternetAddress(it) }.toTypedArray()
        val transport = session.getTransport("smtp")
        try {
          transport.connect(smtp.host, smtp.port, smtp.username, smtp.password)
          message.saveChanges()
          transport.sendMessage(message, envelope)
        } catch (e: AuthenticationFailedException) {
          throw MailError("AUTH", "SMTP : identifiant ou mot de passe refusé", e)
        } catch (e: MessagingException) {
          throw MailError("SEND", "Envoi impossible : ${e.message}", e)
        } finally {
          runCatching { transport.close() }
        }
        if (imap != null && !sentFolder.isNullOrEmpty()) {
          runCatching {
            withFolder(imap, sentFolder, Folder.READ_WRITE) { folder ->
              message.setFlag(Flags.Flag.SEEN, true)
              folder.appendMessages(arrayOf(message))
            }
          }
        }
        true
      }
    }

    /** Forget the cached connection of an account (sign-out, changed password). */
    AsyncFunction("disconnect") Coroutine { imap: ServerConfig ->
      io {
        stores.remove(key(imap))?.let { runCatching { it.close() } }
        true
      }
    }
  }

  // ------------------------------------------------------------------ helpers

  private fun requireContext(): android.content.Context =
    appContext.reactContext?.applicationContext
      ?: throw MailError("NO_CONTEXT", "Application Android indisponible")

  private fun isIgnoringBatteryOptimizations(context: android.content.Context): Boolean {
    val power = context.getSystemService(android.os.PowerManager::class.java) ?: return false
    return power.isIgnoringBatteryOptimizations(context.packageName)
  }

  private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) {
    try {
      block()
    } catch (e: MailError) {
      throw e
    } catch (e: AuthenticationFailedException) {
      throw MailError("AUTH", "Identifiant ou mot de passe refusé par le serveur", e)
    } catch (e: MessagingException) {
      throw MailError("IMAP", e.message ?: "Erreur du serveur de messagerie", e)
    }
  }

  private fun key(config: ServerConfig) = "${config.username.lowercase()}@${config.host.lowercase()}:${config.port}"

  private fun imapProperties(config: ServerConfig): Properties = Properties().apply {
    val protocol = if (config.security == "ssl") "imaps" else "imap"
    put("mail.store.protocol", protocol)
    put("mail.$protocol.host", config.host)
    put("mail.$protocol.port", config.port.toString())
    put("mail.$protocol.connectiontimeout", "20000")
    put("mail.$protocol.timeout", "60000")
    put("mail.$protocol.writetimeout", "60000")
    put("mail.$protocol.partialfetch", "false")
    put("mail.$protocol.fetchsize", "1048576")
    if (config.security == "ssl") put("mail.imaps.ssl.checkserveridentity", "true")
    if (config.security == "starttls") {
      put("mail.imap.starttls.enable", "true")
      put("mail.imap.starttls.required", "true")
      put("mail.imap.ssl.checkserveridentity", "true")
    }
  }

  private fun smtpSession(config: ServerConfig): Session {
    val props = Properties().apply {
      put("mail.smtp.host", config.host)
      put("mail.smtp.port", config.port.toString())
      put("mail.smtp.auth", "true")
      put("mail.smtp.connectiontimeout", "20000")
      put("mail.smtp.timeout", "60000")
      put("mail.smtp.writetimeout", "120000")
      when (config.security) {
        "ssl" -> {
          put("mail.smtp.ssl.enable", "true")
          put("mail.smtp.ssl.checkserveridentity", "true")
        }
        "starttls" -> {
          put("mail.smtp.starttls.enable", "true")
          put("mail.smtp.starttls.required", "true")
          put("mail.smtp.ssl.checkserveridentity", "true")
        }
      }
    }
    return Session.getInstance(props)
  }

  /** Cached, connected store for the account; one operation at a time per account. */
  private suspend fun <T> withStore(config: ServerConfig, block: (IMAPStore) -> T): T {
    val k = key(config)
    return locks.getOrPut(k) { Mutex() }.withLock {
      var store = stores[k]
      if (store == null || !store.isConnected) {
        runCatching { store?.close() }
        val session = Session.getInstance(imapProperties(config))
        val protocol = if (config.security == "ssl") "imaps" else "imap"
        val created = session.getStore(protocol) as IMAPStore
        try {
          created.connect(config.host, config.port, config.username, config.password)
        } catch (e: AuthenticationFailedException) {
          throw MailError("AUTH", "Identifiant ou mot de passe refusé par le serveur", e)
        } catch (e: MessagingException) {
          throw MailError("CONNECT", "Connexion au serveur impossible (${e.message})", e)
        }
        stores[k] = created
        store = created
      }
      block(store)
    }
  }

  private suspend fun <T> withFolder(
    config: ServerConfig,
    name: String,
    mode: Int = Folder.READ_ONLY,
    block: (IMAPFolder) -> T,
  ): T = withStore(config) { store ->
    val folder = store.getFolder(name) as IMAPFolder
    folder.open(mode)
    try {
      block(folder)
    } finally {
      runCatching { folder.close(false) }
    }
  }

  /** Envelope, flags, bodies and attachment list of messages, in one batched fetch. */
  private fun describe(folder: IMAPFolder, messages: Array<Message>): List<Map<String, Any?>> {
    if (messages.isEmpty()) return emptyList()
    val profile = FetchProfile().apply {
      add(FetchProfile.Item.ENVELOPE)
      add(FetchProfile.Item.FLAGS)
      add(FetchProfile.Item.CONTENT_INFO)
      add(UIDFolder.FetchProfileItem.UID)
      add("References")
      add("In-Reply-To")
      add("Message-ID")
      add("List-Unsubscribe")
      add("List-Unsubscribe-Post")
    }
    folder.fetch(messages, profile)
    return messages.mapNotNull { message ->
      runCatching { describeOne(folder, message as IMAPMessage) }.getOrNull()
    }
  }

  private fun describeOne(folder: IMAPFolder, message: IMAPMessage): Map<String, Any?> {
    val body = BodyParts()
    walk(message, "", body)
    val from = (message.from?.firstOrNull() as? InternetAddress)
    return mapOf(
      "uid" to folder.getUID(message).toDouble(),
      "messageId" to message.getHeader("Message-ID")?.firstOrNull(),
      "inReplyTo" to message.getHeader("In-Reply-To")?.firstOrNull(),
      "references" to message.getHeader("References")?.firstOrNull(),
      "fromName" to (from?.personal ?: ""),
      "fromAddress" to (from?.address ?: ""),
      "to" to addresses(message.getRecipients(Message.RecipientType.TO)),
      "cc" to addresses(message.getRecipients(Message.RecipientType.CC)),
      "subject" to (message.subject ?: ""),
      "date" to ((message.receivedDate ?: message.sentDate)?.time?.toDouble() ?: 0.0),
      "seen" to message.isSet(Flags.Flag.SEEN),
      "flagged" to message.isSet(Flags.Flag.FLAGGED),
      "text" to body.text,
      "html" to body.html,
      "attachments" to body.attachments,
      "listUnsubscribe" to message.getHeader("List-Unsubscribe")?.firstOrNull()?.let { MimeUtility.unfold(it) },
      "listUnsubscribePost" to message.getHeader("List-Unsubscribe-Post")?.firstOrNull(),
    )
  }

  private fun addresses(list: Array<Address>?): List<Map<String, String>> =
    list.orEmpty().filterIsInstance<InternetAddress>().map {
      mapOf("name" to (it.personal ?: ""), "address" to (it.address ?: ""))
    }

  private class BodyParts {
    var text: String? = null
    var html: String? = null
    val attachments = mutableListOf<Map<String, Any?>>()
  }

  /** Depth-first walk: first text/plain and text/html bodies, every other part is an attachment. */
  private fun walk(part: Part, path: String, acc: BodyParts) {
    val content = runCatching { part.content }.getOrNull()
    if (content is Multipart) {
      for (i in 0 until content.count) {
        val childPath = if (path.isEmpty()) "${i + 1}" else "$path.${i + 1}"
        walk(content.getBodyPart(i), childPath, acc)
      }
      return
    }
    val disposition = runCatching { part.disposition }.getOrNull()
    val filename = runCatching { part.fileName }.getOrNull()?.let { decode(it) }
    val isAttachment = Part.ATTACHMENT.equals(disposition, true) || !filename.isNullOrEmpty()
    if (!isAttachment && content is String) {
      when {
        part.isMimeType("text/plain") && acc.text == null -> acc.text = content
        part.isMimeType("text/html") && acc.html == null -> acc.html = content
      }
      return
    }
    if (isAttachment || content !is String) {
      val mime = runCatching { part.contentType.substringBefore(';').trim().lowercase() }.getOrDefault("application/octet-stream")
      // Encoded size: base64 grows by ~4/3.
      val size = runCatching { part.size }.getOrDefault(-1)
      acc.attachments.add(
        mapOf(
          "filename" to (filename ?: "Pièce jointe"),
          "mimeType" to mime,
          "size" to (if (size > 0) (size * 3.0 / 4.0) else 0.0),
          "partPath" to (if (path.isEmpty()) "1" else path),
        ),
      )
    }
  }

  private fun decode(value: String): String = runCatching { MimeUtility.decodeText(value) }.getOrDefault(value)

  /** Part at a "2.1"-style path (the root message is path "1" when it is not multipart). */
  private fun findPart(message: Message, path: String): Part? {
    var current: Part = message
    for (segment in path.split('.')) {
      val index = segment.toIntOrNull() ?: return null
      val content = current.content
      current = if (content is Multipart) {
        if (index < 1 || index > content.count) return null
        content.getBodyPart(index - 1)
      } else {
        return if (index == 1) current else null
      }
    }
    return current
  }
}
