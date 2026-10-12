/**
 * Biometric authentication adapter backed by `expo-local-authentication`.
 *
 * Kept behind a tiny interface so the app lock can be driven from tests and so
 * a missing sensor, an unenrolled device or a native error is reported as a
 * plain `false` rather than crashing the caller.
 */

import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricAuthenticator {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}

export function createExpoBiometricAuthenticator(): BiometricAuthenticator {
  return {
    async isAvailable(): Promise<boolean> {
      try {
        return (
          (await LocalAuthentication.hasHardwareAsync()) &&
          (await LocalAuthentication.isEnrolledAsync())
        );
      } catch {
        return false;
      }
    },

    async authenticate(reason: string): Promise<boolean> {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason,
          cancelLabel: 'Annuler',
          disableDeviceFallback: false,
        });
        return result.success;
      } catch {
        return false;
      }
    },
  };
}
