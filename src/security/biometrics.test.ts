import * as LocalAuthentication from 'expo-local-authentication';

import { createExpoBiometricAuthenticator } from '@/security/biometrics';

// expo-local-authentication is a native module: stub its surface so the adapter
// logic can be exercised in isolation.
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const hasHardwareAsync = jest.mocked(LocalAuthentication.hasHardwareAsync);
const isEnrolledAsync = jest.mocked(LocalAuthentication.isEnrolledAsync);
const authenticateAsync = jest.mocked(LocalAuthentication.authenticateAsync);

describe('createExpoBiometricAuthenticator', () => {
  describe('isAvailable', () => {
    it('is true when both hardware and an enrolment are present', async () => {
      hasHardwareAsync.mockResolvedValue(true);
      isEnrolledAsync.mockResolvedValue(true);

      await expect(createExpoBiometricAuthenticator().isAvailable()).resolves.toBe(true);
    });

    it('is false without biometric hardware and skips the enrolment check', async () => {
      hasHardwareAsync.mockResolvedValue(false);
      isEnrolledAsync.mockResolvedValue(true);

      await expect(createExpoBiometricAuthenticator().isAvailable()).resolves.toBe(false);
      expect(isEnrolledAsync).not.toHaveBeenCalled();
    });

    it('is false when the device has hardware but nothing enrolled', async () => {
      hasHardwareAsync.mockResolvedValue(true);
      isEnrolledAsync.mockResolvedValue(false);

      await expect(createExpoBiometricAuthenticator().isAvailable()).resolves.toBe(false);
    });

    it('is false when the native module throws', async () => {
      hasHardwareAsync.mockRejectedValue(new Error('native failure'));

      await expect(createExpoBiometricAuthenticator().isAvailable()).resolves.toBe(false);
    });
  });

  describe('authenticate', () => {
    it('returns true and forwards the prompt options on success', async () => {
      authenticateAsync.mockResolvedValue({ success: true });

      await expect(
        createExpoBiometricAuthenticator().authenticate('Déverrouillez Wouah Mail'),
      ).resolves.toBe(true);
      expect(authenticateAsync).toHaveBeenCalledWith({
        promptMessage: 'Déverrouillez Wouah Mail',
        cancelLabel: 'Annuler',
        disableDeviceFallback: false,
      });
    });

    it('returns false when the user cancels', async () => {
      authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

      await expect(
        createExpoBiometricAuthenticator().authenticate('Déverrouillez Wouah Mail'),
      ).resolves.toBe(false);
    });

    it('returns false when the native module throws', async () => {
      authenticateAsync.mockRejectedValue(new Error('native failure'));

      await expect(
        createExpoBiometricAuthenticator().authenticate('Déverrouillez Wouah Mail'),
      ).resolves.toBe(false);
    });
  });
});
