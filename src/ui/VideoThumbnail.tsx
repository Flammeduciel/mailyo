import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail as NativeThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export interface VideoThumbnailProps {
  /** Video URI; without one the tile shows a play icon on a dark background. */
  uri: string | null;
  style?: StyleProp<ViewStyle>;
}

/** First frame of a video (at 1 s) under a play icon. */
export function VideoThumbnail({ uri, style }: VideoThumbnailProps) {
  return (
    <View style={[styles.box, style]}>
      {uri && Platform.OS !== 'web' ? <Frame uri={uri} /> : null}
      <MaterialIcons name="play-circle-filled" size={48} color="#FFFFFF" style={styles.icon} />
    </View>
  );
}

function Frame({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = true;
  });
  const [thumbnail, setThumbnail] = useState<NativeThumbnail | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Some platforms/sources throw synchronously instead of rejecting: a missing
    // thumbnail must never break the conversation, only show the plain tile.
    void (async () => {
      try {
        const frames = await player.generateThumbnailsAsync(1);
        if (!cancelled && frames[0]) setThumbnail(frames[0]);
      } catch {
        // Keep the dark tile with the play icon.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player]);

  return thumbnail ? (
    <Image source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" />
  ) : null;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#1F2933',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  icon: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
  },
});
