import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { discoverSettings } from '@/providers/imap/autoconfig';
import {
  isMicrosoftAddress,
  MAIL_SERVICES,
  presetForAddress,
  type Security,
  type ServerSettings,
} from '@/providers/imap/presets';
import { useApp } from '@/state/app-context';
import { AppBar, AppText, Button, Radius, ServiceLogo, Spacing, useAppTheme } from '@/ui';
import { openLink } from '@/ui/open-link';

const SECURITY_LABELS: Record<Security, string> = {
  ssl: 'SSL/TLS',
  starttls: 'STARTTLS',
  none: 'Aucune',
};

/**
 * Add an IMAP account: address + password (an app password for Yahoo,
 * iCloud, Fastmail…). Servers come from the chosen service, the public
 * autoconfig database, or the advanced settings. The login is tested before
 * the account is created.
 */
export default function ImapLoginScreen() {
  const { service: serviceId } = useLocalSearchParams<{ service?: string }>();
  const colors = useAppTheme();
  const { service, refresh, invalidate } = useApp();
  const chosen = MAIL_SERVICES.find((s) => s.id === serviceId);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [imap, setImap] = useState<ServerSettings | null>(chosen?.imap ?? null);
  const [smtp, setSmtp] = useState<ServerSettings | null>(chosen?.smtp ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The address may reveal another known service than the tile tapped.
  const preset = useMemo(() => presetForAddress(email) ?? chosen, [email, chosen]);
  const microsoft = isMicrosoftAddress(email);

  // Once the address is typed: known service → its servers; otherwise ask the
  // autoconfig database (only the domain is sent). OVH-style presets (own
  // domain, no known domain list) keep their servers.
  const lookUpServers = async () => {
    if (!email.includes('@')) return;
    if (chosen && chosen.domains.length === 0) return;
    const found = await discoverSettings(email);
    if (found.preset || !chosen) {
      setImap(found.imap);
      setSmtp(found.smtp);
    }
  };

  const connect = async () => {
    setError(null);
    setBusy(true);
    try {
      let servers = imap && smtp ? { imap, smtp } : null;
      if (!servers) {
        const found = await discoverSettings(email);
        servers = { imap: found.imap, smtp: found.smtp };
        setImap(found.imap);
        setSmtp(found.smtp);
      }
      await service.connectImapAccount({
        emailAddress: email.trim(),
        config: {
          username: email.trim(),
          password,
          imap: servers.imap,
          smtp: servers.smtp,
          serviceId: preset?.id,
        },
      });
      // Home right away: the progress ring there shows the first sync.
      router.dismissAll();
      router.replace('/discussions');
      void refresh();
      invalidate();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      setError(
        /refusé|AUTH/i.test(text) && preset?.appPasswordRequired
          ? `${text}. ${preset.name} demande un mot de passe d’application, pas votre mot de passe habituel.`
          : text,
      );
      setAdvanced((value) => value || /CONNECT|connexion/i.test(text));
    } finally {
      setBusy(false);
    }
  };

  const canConnect = email.includes('@') && password.length > 0 && !busy && !microsoft;
  const title = chosen?.name ?? 'Autre adresse';

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <AppBar title={title} subtitle="Connexion IMAP" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <ServiceLogo
              id={preset?.id ?? 'other'}
              color={preset?.color ?? '#607D8B'}
              monogram={preset?.monogram ?? '@'}
              size={64}
            />
            <AppText variant="subtitle" weight="semibold">
              {preset?.name ?? title}
            </AppText>
          </View>

          <Field label="Adresse email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              onBlur={() => void lookUpServers()}
              placeholder={chosen?.domains[0] ? `nom@${chosen.domains[0]}` : 'nom@exemple.fr'}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              testID="imap-email"
            />
          </Field>

          {microsoft ? (
            <Notice
              icon="schedule"
              text="Les adresses Outlook, Hotmail et Live arrivent bientôt avec la connexion Microsoft."
            />
          ) : null}

          <Field
            label={preset?.appPasswordRequired ? 'Mot de passe d’application' : 'Mot de passe'}
          >
            <View
              style={[
                styles.passwordRow,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.passwordInput, { color: colors.text }]}
                testID="imap-password"
              />
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={Spacing.sm}
                accessibilityLabel={
                  showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </Field>

          {preset?.appPasswordRequired ? (
            <View style={[styles.help, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="key" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <AppText
                  variant="caption"
                  weight="semibold"
                  style={{ color: colors.onPrimaryContainer }}
                >
                  {preset.name} n’accepte pas votre mot de passe habituel dans les applications.
                </AppText>
                <AppText variant="caption" style={{ color: colors.onPrimaryContainer }}>
                  Créez un mot de passe d’application : {preset.hint}.
                </AppText>
                {preset.appPasswordUrl ? (
                  <Pressable
                    onPress={() => void openLink(preset.appPasswordUrl!)}
                    hitSlop={Spacing.sm}
                  >
                    <AppText variant="caption" weight="semibold" style={{ color: colors.link }}>
                      Créer un mot de passe d’application ›
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : preset?.hint ? (
            <Notice icon="info-outline" text={preset.hint} />
          ) : null}

          <Pressable
            onPress={() => setAdvanced((value) => !value)}
            style={styles.advancedToggle}
            accessibilityRole="button"
            testID="imap-advanced"
          >
            <AppText variant="body" weight="semibold" style={{ color: colors.primary }}>
              Réglages avancés
            </AppText>
            <MaterialIcons
              name={advanced ? 'expand-less' : 'expand-more'}
              size={22}
              color={colors.primary}
            />
          </Pressable>

          {advanced ? (
            <View
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <ServerEditor
                title="Réception (IMAP)"
                value={imap}
                onChange={setImap}
                defaultPort={993}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ServerEditor
                title="Envoi (SMTP)"
                value={smtp}
                onChange={setSmtp}
                defaultPort={465}
              />
            </View>
          ) : null}

          {error ? (
            <View style={[styles.help, { backgroundColor: colors.danger + '1A' }]}>
              <MaterialIcons name="error-outline" size={20} color={colors.danger} />
              <AppText variant="caption" style={[styles.flex, { color: colors.danger }]}>
                {error}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Button
            label={busy ? 'Vérification…' : 'Se connecter'}
            onPress={() => void connect()}
            disabled={!canConnect}
            loading={busy}
            fullWidth
            testID="imap-connect"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" weight="semibold" color="textSecondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function Notice({ icon, text }: { icon: string; text: string }) {
  const colors = useAppTheme();
  return (
    <View style={[styles.help, { backgroundColor: colors.surfaceAlt }]}>
      <MaterialIcons name={icon as never} size={20} color={colors.textSecondary} />
      <AppText variant="caption" color="textSecondary" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function ServerEditor({
  title,
  value,
  onChange,
  defaultPort,
}: {
  title: string;
  value: ServerSettings | null;
  onChange: (value: ServerSettings) => void;
  defaultPort: number;
}) {
  const colors = useAppTheme();
  const current = value ?? { host: '', port: defaultPort, security: 'ssl' as Security };
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
  ];
  return (
    <View style={styles.server}>
      <AppText variant="body" weight="semibold">
        {title}
      </AppText>
      <View style={styles.serverRow}>
        <TextInput
          value={current.host}
          onChangeText={(host) => onChange({ ...current, host: host.trim() })}
          placeholder="serveur.exemple.fr"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[inputStyle, styles.flex]}
        />
        <TextInput
          value={String(current.port)}
          onChangeText={(port) =>
            onChange({ ...current, port: Number(port.replace(/\D/g, '')) || 0 })
          }
          keyboardType="number-pad"
          style={[inputStyle, styles.port]}
        />
      </View>
      <View style={styles.securityRow}>
        {(['ssl', 'starttls'] as Security[]).map((security) => {
          const selected = current.security === security;
          return (
            <Pressable
              key={security}
              onPress={() => onChange({ ...current, security })}
              style={[
                styles.securityChip,
                { backgroundColor: selected ? colors.primaryContainer : colors.surfaceAlt },
              ]}
            >
              <AppText
                variant="caption"
                weight="semibold"
                style={{ color: selected ? colors.onPrimaryContainer : colors.textSecondary }}
              >
                {SECURITY_LABELS[security]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  hero: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  field: { gap: Spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingRight: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
  },
  help: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  advancedToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth },
  server: { padding: Spacing.md, gap: Spacing.sm },
  serverRow: { flexDirection: 'row', gap: Spacing.sm },
  port: { width: 84, textAlign: 'center' },
  securityRow: { flexDirection: 'row', gap: Spacing.sm },
  securityChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.lg,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
