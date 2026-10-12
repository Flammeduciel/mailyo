import {
  BUILT_IN_SOUNDS,
  CHANNELS,
  DEFAULT_CHANNEL_ID,
  PRIORITY_CHANNEL_ID,
  SILENT_CHANNEL_ID,
  channelIdForDecision,
  getSound,
} from '@/notifications/channels';

describe('channels', () => {
  describe('getSound', () => {
    it('falls back to the default sound for an unknown id', () => {
      expect(getSound('does-not-exist').id).toBe('default');
    });

    it('falls back to the default sound for null', () => {
      expect(getSound(null).id).toBe('default');
    });

    it('returns the matching built-in sound', () => {
      expect(getSound('soft')).toEqual({ id: 'soft', name: 'Doux', file: 'soft.wav' });
      expect(getSound('urgent').file).toBe('urgent.wav');
      expect(getSound('none').name).toBe('Aucun');
    });

    it('exposes the documented built-in sounds', () => {
      expect(BUILT_IN_SOUNDS.map((sound) => sound.id)).toEqual([
        'default',
        'soft',
        'urgent',
        'none',
      ]);
    });
  });

  describe('channelIdForDecision', () => {
    it('uses the silent channel when notify is false', () => {
      expect(
        channelIdForDecision({ notify: false, soundId: 'urgent', vibrationMode: 'long' }),
      ).toBe(SILENT_CHANNEL_ID);
    });

    it('uses the silent channel when sound and vibration are both none', () => {
      expect(channelIdForDecision({ notify: true, soundId: 'none', vibrationMode: 'none' })).toBe(
        SILENT_CHANNEL_ID,
      );
    });

    it('uses the priority channel for the urgent sound', () => {
      expect(
        channelIdForDecision({ notify: true, soundId: 'urgent', vibrationMode: 'default' }),
      ).toBe(PRIORITY_CHANNEL_ID);
    });

    it('uses the priority channel for a long vibration', () => {
      expect(
        channelIdForDecision({ notify: true, soundId: 'default', vibrationMode: 'long' }),
      ).toBe(PRIORITY_CHANNEL_ID);
    });

    it('prefers priority over silent when only one of sound/vibration is none', () => {
      expect(channelIdForDecision({ notify: true, soundId: 'none', vibrationMode: 'long' })).toBe(
        PRIORITY_CHANNEL_ID,
      );
    });

    it('uses the default channel otherwise', () => {
      expect(channelIdForDecision({ notify: true, soundId: 'soft', vibrationMode: 'short' })).toBe(
        DEFAULT_CHANNEL_ID,
      );
      expect(
        channelIdForDecision({ notify: true, soundId: 'default', vibrationMode: 'default' }),
      ).toBe(DEFAULT_CHANNEL_ID);
    });
  });

  describe('CHANNELS', () => {
    it('defines default, priority and silent with the expected settings', () => {
      const byId = Object.fromEntries(CHANNELS.map((channel) => [channel.id, channel]));
      expect(byId[DEFAULT_CHANNEL_ID]).toMatchObject({
        importance: 'high',
        vibration: true,
        soundId: 'default',
      });
      expect(byId[PRIORITY_CHANNEL_ID]).toMatchObject({
        importance: 'max',
        vibration: true,
        soundId: 'urgent',
      });
      expect(byId[SILENT_CHANNEL_ID]).toMatchObject({
        importance: 'low',
        vibration: false,
        soundId: 'none',
      });
    });
  });
});
