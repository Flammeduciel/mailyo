import { MaterialIcons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from './AppText';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

/** Props expo-router passes to a custom `tabBar`. */
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export interface TabMeta {
  icon: string;
  activeIcon?: string;
  badge?: number;
}

export interface BottomTabBarProps extends TabBarProps {
  /** Icon and badge per route name. */
  meta: Record<string, TabMeta>;
}

/**
 * Android messaging-style navigation bar: icon inside a tinted pill when
 * active, bold label below, numeric badge on the icon.
 */
export function BottomTabBar({ state, descriptors, navigation, insets, meta }: BottomTabBarProps) {
  const colors = useAppTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.separator,
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key].options;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const routeMeta = meta[route.name] ?? { icon: 'circle' };
        const icon = focused ? (routeMeta.activeIcon ?? routeMeta.icon) : routeMeta.icon;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            testID={`tab-${route.name}`}
            style={styles.item}
          >
            <View style={styles.indicator}>
              {/* Mounted rather than recoloured: on Android, switching backgroundColor
                  from transparent drops the borderRadius. */}
              {focused ? (
                <View
                  style={[styles.indicatorFill, { backgroundColor: colors.primaryContainer }]}
                />
              ) : null}
              <MaterialIcons
                name={icon as never}
                size={24}
                color={focused ? colors.onPrimaryContainer : colors.textSecondary}
              />
              {routeMeta.badge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.unreadBadge, borderColor: colors.surface },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                    {routeMeta.badge > 99 ? '99+' : routeMeta.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <AppText
              variant="caption"
              weight={focused ? 'bold' : 'medium'}
              style={{
                color: focused ? colors.text : colors.textSecondary,
                fontSize: 12,
                letterSpacing: 0.1,
              }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: Spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  indicator: {
    width: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.pill,
  },
  badge: {
    position: 'absolute',
    top: -2,
    left: 34,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
