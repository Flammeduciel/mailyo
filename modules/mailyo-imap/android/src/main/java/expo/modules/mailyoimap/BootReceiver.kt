package expo.modules.mailyoimap

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the real-time service after a reboot or an app update, if it was on. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val hasAccounts = runCatching { PushConfigStore(context).load().accounts.isNotEmpty() }.getOrDefault(false)
    if (hasAccounts) runCatching { MailPushService.start(context) }
  }
}
