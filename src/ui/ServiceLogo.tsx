import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { useAppTheme } from './theme';

/** Official logos of the mail services (see assets/images/services/NOTICE.md). */
const LOGOS: Record<string, number> = {
  gmail: require('@/assets/images/services/gmail.png'),
  yahoo: require('@/assets/images/services/yahoo.png'),
  icloud: require('@/assets/images/services/icloud.png'),
  orange: require('@/assets/images/services/orange.png'),
  free: require('@/assets/images/services/free.png'),
  sfr: require('@/assets/images/services/sfr.png'),
  laposte: require('@/assets/images/services/laposte.png'),
  gmx: require('@/assets/images/services/gmx.png'),
  zoho: require('@/assets/images/services/zoho.png'),
  fastmail: require('@/assets/images/services/fastmail.png'),
  ovh: require('@/assets/images/services/ovh.png'),
  outlook: require('@/assets/images/services/outlook.png'),
  microsoft365: require('@/assets/images/services/microsoft365.png'),
};

export interface ServiceLogoProps {
  /** Service id (gmail, yahoo, icloud, orange…). */
  id: string;
  /** Brand colour, used for the fallback tile. */
  color: string;
  /** Fallback text when no logo exists (« Autre adresse »). */
  monogram: string;
  size?: number;
  /** Greyed out (coming soon). */
  muted?: boolean;
}

/** The service's real logo on a white rounded tile (or a coloured monogram). */
export function ServiceLogo({ id, color, monogram, size = 44, muted = false }: ServiceLogoProps) {
  const colors = useAppTheme();
  const logo = LOGOS[id];
  const radius = size * 0.26;
  if (!logo) {
    return (
      <View
        style={[
          styles.tile,
          { width: size, height: size, borderRadius: radius, backgroundColor: color },
          muted && styles.muted,
        ]}
      >
        <AppText weight="bold" style={[styles.monogram, { fontSize: size * 0.4 }]}>
          {monogram || '@'}
        </AppText>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: '#FFFFFF',
          borderColor: colors.border,
        },
        styles.bordered,
        muted && styles.muted,
      ]}
      accessibilityIgnoresInvertColors
    >
      <Image source={logo} style={{ width: size * 0.86, height: size * 0.86 }} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bordered: { borderWidth: StyleSheet.hairlineWidth },
  muted: { opacity: 0.45 },
  monogram: { color: '#FFFFFF' },
});
