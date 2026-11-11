import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { filterContacts, type ContactSuggestion } from '@/domain/contacts';
import type { EmailAddress } from '@/domain/models';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Radius, Spacing, useAppTheme } from './theme';

const EMAIL = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]{2,}$/;

export interface RecipientFieldProps {
  label: string;
  recipients: EmailAddress[];
  onChange: (recipients: EmailAddress[]) => void;
  contacts: ContactSuggestion[];
  photoOf?: (address: string) => string | undefined;
  /** Called when the suggestion list opens/closes (the screen hides the rest of the form). */
  onPickingChange?: (picking: boolean) => void;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * "À" field like a messaging app: chosen people as chips with their avatar,
 * and while the field is active, the people you already wrote to — filtered as
 * you type. A typed address is accepted with space, comma or Entrée.
 */
export function RecipientField({
  label,
  recipients,
  onChange,
  contacts,
  photoOf,
  onPickingChange,
  autoFocus,
  testID,
}: RecipientFieldProps) {
  const colors = useAppTheme();
  const input = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(
    () =>
      filterContacts(
        contacts,
        query,
        recipients.map((r) => r.address),
      ).slice(0, 50),
    [contacts, query, recipients],
  );

  const setPicking = (value: boolean) => {
    setFocused(value);
    onPickingChange?.(value);
  };

  const add = (recipient: EmailAddress) => {
    if (!recipients.some((r) => r.address.toLowerCase() === recipient.address.toLowerCase())) {
      onChange([...recipients, recipient]);
    }
    setQuery('');
  };

  // A typed address becomes a chip on separator; otherwise keep typing.
  const onChangeText = (text: string) => {
    const match = /^(.*?)[\s,;]+$/.exec(text);
    if (match && EMAIL.test(match[1].trim())) {
      add({ name: '', address: match[1].trim() });
      return;
    }
    setQuery(text);
  };

  const commitTyped = () => {
    const typed = query.trim();
    if (EMAIL.test(typed)) {
      add({ name: '', address: typed });
    } else if (suggestions[0] && typed) {
      add({ name: suggestions[0].name, address: suggestions[0].address });
    }
  };

  const showTypedRow =
    EMAIL.test(query.trim()) &&
    !suggestions.some((s) => s.address.toLowerCase() === query.trim().toLowerCase());

  return (
    <View testID={testID}>
      <Pressable
        onPress={() => input.current?.focus()}
        style={[styles.field, { borderBottomColor: focused ? colors.primary : colors.border }]}
      >
        <AppText variant="body" color="textSecondary" style={styles.label}>
          {label}
        </AppText>
        <View style={styles.chips}>
          {recipients.map((recipient) => (
            <View
              key={recipient.address}
              style={[styles.chip, { backgroundColor: colors.primaryContainer }]}
            >
              <Avatar
                name={recipient.name || recipient.address}
                size={22}
                imageUri={photoOf?.(recipient.address)}
              />
              <AppText
                variant="caption"
                weight="semibold"
                numberOfLines={1}
                style={styles.chipText}
              >
                {recipient.name || recipient.address}
              </AppText>
              <Pressable
                onPress={() => onChange(recipients.filter((r) => r.address !== recipient.address))}
                accessibilityLabel={`Retirer ${recipient.name || recipient.address}`}
                hitSlop={Spacing.sm}
              >
                <MaterialIcons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          <TextInput
            ref={input}
            value={query}
            onChangeText={onChangeText}
            onFocus={() => setPicking(true)}
            onBlur={() => {
              commitTyped();
              setPicking(false);
            }}
            onSubmitEditing={commitTyped}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && query === '' && recipients.length > 0) {
                onChange(recipients.slice(0, -1));
              }
            }}
            placeholder={recipients.length === 0 ? 'Nom ou adresse email' : ''}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            blurOnSubmit={false}
            style={[styles.input, { color: colors.text }]}
            testID={testID ? `${testID}-input` : undefined}
          />
        </View>
      </Pressable>

      {focused ? (
        // Plain rendering (max 50 rows): the screen already scrolls.
        <View style={styles.list}>
          {recipients.length > 0 ? (
            <Pressable
              onPress={() => input.current?.blur()}
              style={[styles.done, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              testID={testID ? `${testID}-done` : undefined}
            >
              <AppText variant="body" weight="semibold" style={{ color: colors.onPrimary }}>
                Continuer
              </AppText>
              <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
            </Pressable>
          ) : null}
          {showTypedRow ? (
            <SuggestionRow
              title={query.trim()}
              subtitle="Utiliser cette adresse"
              onPress={() => add({ name: '', address: query.trim() })}
            />
          ) : null}
          {suggestions.length > 0 ? (
            <AppText
              variant="caption"
              weight="semibold"
              color="textSecondary"
              style={styles.section}
            >
              {query.trim() ? 'Contacts' : 'Contacts récents'}
            </AppText>
          ) : null}
          {suggestions.map((item) => (
            <SuggestionRow
              key={item.address}
              title={item.name || item.address}
              subtitle={
                item.name
                  ? item.address
                  : item.count > 0
                    ? `${item.count} échange${item.count > 1 ? 's' : ''}`
                    : ''
              }
              photo={photoOf?.(item.address)}
              onPress={() => add({ name: item.name, address: item.address })}
              testID={`suggestion-${item.address}`}
            />
          ))}
          {!showTypedRow && query.trim() && suggestions.length === 0 ? (
            <AppText variant="body" color="textSecondary" style={styles.empty}>
              Aucun contact. Tapez une adresse complète.
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SuggestionRow({
  title,
  subtitle,
  photo,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  photo?: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
      testID={testID}
    >
      <Avatar name={title} size={44} imageUri={photo} />
      <View style={styles.rowText}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  label: {
    paddingTop: Spacing.sm,
    minWidth: 32,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 3,
    paddingRight: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.lg,
    maxWidth: '100%',
  },
  chipText: {
    flexShrink: 1,
  },
  input: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  list: {
    paddingBottom: Spacing.lg,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  section: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  empty: {
    paddingVertical: Spacing.lg,
  },
});
