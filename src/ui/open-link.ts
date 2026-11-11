import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

/** Open a link from an email: web pages in the in-app browser, the rest via the OS. */
export async function openLink(href: string): Promise<void> {
  try {
    if (/^https?:\/\//i.test(href)) {
      await WebBrowser.openBrowserAsync(href);
    } else {
      await Linking.openURL(href);
    }
  } catch {
    // No handler for this scheme: ignore rather than crash the conversation.
  }
}
