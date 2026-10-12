import { DEFAULT_SETTINGS, parseAppSettings, serializeAppSettings } from '@/domain/settings';

describe('app settings', () => {
  it('falls back to defaults on empty input', () => {
    expect(parseAppSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings through serialisation', () => {
    const settings = {
      contentMode: 'sender' as const,
      defaultSoundId: 'urgent',
      quietHours: { startHour: 22, endHour: 6 },
      theme: 'dark' as const,
    };
    expect(parseAppSettings(serializeAppSettings(settings))).toEqual(settings);
  });

  it('serialises a null sound and disabled quiet hours as empty strings', () => {
    const raw = serializeAppSettings({ ...DEFAULT_SETTINGS, defaultSoundId: null, quietHours: null });
    expect(raw['notification.defaultSoundId']).toBe('');
    expect(raw['notification.quietHours']).toBe('');
    expect(parseAppSettings(raw)).toMatchObject({ defaultSoundId: null, quietHours: null });
  });

  it('ignores unknown content modes and themes', () => {
    const parsed = parseAppSettings({
      'notification.contentMode': 'nonsense',
      'app.theme': 'neon',
    });
    expect(parsed.contentMode).toBe(DEFAULT_SETTINGS.contentMode);
    expect(parsed.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('ignores malformed quiet hours JSON', () => {
    expect(parseAppSettings({ 'notification.quietHours': '{not json' }).quietHours).toBeNull();
  });
});
