import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PermissionTag } from '@/domain/permissions';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Radius, Spacing, useAppTheme } from './theme';

export interface AccountRowProps {
  emailAddress: string;
  subtitle: string;
  photoUri?: string;
  permissions: PermissionTag[];
  onSignOut: () => void;
  testID?: string;
}

/** A connected account: identity, granted permissions as tags, sign-out action. */
export function AccountRow({
  emailAddress,
  subtitle,
  photoUri,
  permissions,
  onSignOut,
  testID,
}: AccountRowProps) {
  const colors = useAppTheme();

  return (
    <View style={styles.row} testID={testID}>
      <Avatar name={emailAddress} size={44} imageUri={photoUri} />
      <View style={styles.content}>
        <AppText weight="semibold" numberOfLines={1}>
          {emailAddress}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {subtitle}
        </AppText>
        {permissions.length > 0 ? (
          <View style={styles.tags}>
            {permissions.map((permission) => (
              <View
                key={permission.label}
                style={[
                  styles.tag,
                  permission.granted
                    ? { backgroundColor: colors.primaryContainer }
                    : { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <MaterialIcons
                  name={permission.granted ? 'check' : 'block'}
                  size={13}
                  color={permission.granted ? colors.onPrimaryContainer : colors.textMuted}
                />
                <AppText
                  variant="caption"
                  style={{
                    color: permission.granted ? colors.onPrimaryContainer : colors.textMuted,
                  }}
                >
                  {permission.label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Se déconnecter de ${emailAddress}`}
          onPress={onSignOut}
          hitSlop={Spacing.sm}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
          testID={testID ? `${testID}-sign-out` : undefined}
        >
          <MaterialIcons name="logout" size={18} color={colors.danger} />
          <AppText variant="caption" weight="semibold" style={{ color: colors.danger }}>
            Se déconnecter
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
});
