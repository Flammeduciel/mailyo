import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from './AppText';
import { SERVICE_LOGO_PATHS } from './service-logo-paths';

export interface ServiceLogoProps {
  /** Service id (gmail, yahoo, icloud, orange…). */
  id: string;
  color: string;
  monogram: string;
  size?: number;
  /** Greyed out (coming soon). */
  muted?: boolean;
}

/** Rounded tile in the brand colour with the service mark (or its monogram). */
export function ServiceLogo({ id, color, monogram, size = 44, muted = false }: ServiceLogoProps) {
  const path = SERVICE_LOGO_PATHS[id];
  const glyph = size * 0.56;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.26, backgroundColor: color },
        muted && styles.muted,
      ]}
    >
      {path ? (
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <Path d={path} fill="#FFFFFF" />
        </Svg>
      ) : (
        <AppText
          weight="bold"
          style={[styles.monogram, { fontSize: monogram.length > 2 ? size * 0.26 : size * 0.38 }]}
        >
          {monogram || '@'}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.45 },
  monogram: { color: '#FFFFFF', letterSpacing: -0.5 },
});
