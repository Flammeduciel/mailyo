import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  keyboardType,
  autoCapitalize = 'sentences',
  testID,
}: TextFieldProps) {
  const colors = useAppTheme();
  const borderColor = error ? colors.danger : colors.border;

  return (
    <View style={styles.field}>
      {label ? (
        <AppText variant="label" weight="medium" color="textSecondary">
          {label}
        </AppText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        testID={testID}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor },
        ]}
      />
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.xs,
  },
  input: {
    fontSize: FontSize.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  multiline: {
    minHeight: FontSize.xxl * 4,
    textAlignVertical: 'top',
  },
});
