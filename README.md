# MailYo

Application email mobile type WhatsApp, en **React Native + Expo**, qui parle
**directement en IMAP/SMTP** (pas de serveur intermédiaire). IMAP IDLE pour la
réception temps réel, notifications avec **sons personnalisés par expéditeur**.

> ⚠️ **Development build obligatoire.** MailYo dépend de modules natifs
> (SQLite, notifications, background task, secure store, biométrie, audio) qui
> ne sont **pas** inclus dans Expo Go. Lancez `npx expo run:android` /
> `npx expo run:ios` ou `eas build --profile development`.

## Stack

- **Expo SDK 57** / React Native 0.86 / React 19, Expo Router (file-based routing).
- **expo-sqlite** — cache local (comptes, dossiers, threads, emails, règles).
- **expo-secure-store** — secrets (mots de passe IMAP, tokens OAuth).
- **expo-notifications** — notifications locales.
- **expo-background-task** + **expo-task-manager** — sync/IDLE en arrière-plan.
- **expo-audio** — sons de notification personnalisés.
- **expo-auth-session** + **expo-crypto** — OAuth2 (Gmail).
- **expo-local-authentication** — verrou biométrique.

## Démarrer

```bash
npm install
npx expo run:android   # ou run:ios — crée le dev build (CNG, pas de dossier natif committé)
```

## Structure

```
src/
  app/                     # routes Expo Router (présentation / navigation)
    _layout.tsx            # providers (gesture, safe-area, thème) + migrations SQLite
    (tabs)/
      _layout.tsx          # onglets Inbox / Paramètres
      inbox/index.tsx
      settings/index.tsx
    thread/[id].tsx        # conversation
    compose.tsx            # nouveau message (SMTP)
    login.tsx              # configuration compte IMAP/OAuth2
  ui/                      # composants de présentation réutilisables
  state/                   # store d'application (useSyncExternalStore)
  domain/                  # cœur métier pur et testable (threading, règles, sanitize…)
  data/                    # SQLite, migrations, repositories
    db/                    # abstraction Database + adaptateur expo-sqlite + schéma
    repositories/          # accès typés aux tables (accounts, messages, threads…)
  providers/               # contrats des adaptateurs fournisseurs (OAuth/IMAP/SMTP)
  sync/                    # moteur de synchronisation + file d'opérations
  notifications/           # résolution des règles + publication système
  components/              # ThemedText, ThemedView, ui/collapsible
  constants/               # theme, config
  hooks/                   # useTheme, useColorScheme
```

## Configuration native (CNG)

Aucun dossier `ios/` / `android/` n'est committé : la config vit dans
`app.json` (permissions Android, plugins) et est régénérée au build.
Permissions Android : `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`.

## Scripts

```bash
npm run verify      # typecheck + lint + tests
npm run typecheck
npm run lint
npm test
```

## Notes MVP

- Schéma SQLite appliqué idempotemment au démarrage (`PRAGMA user_version`) +
  index plein texte **FTS5** (`messages_fts`) pour la recherche.
- Les implémentations natives Gmail OAuth / IMAP IDLE / SMTP restent à écrire
  dans `src/providers/` (elles implémentent l'interface `MailProvider`).
- Un `MockMailProvider` déterministe permet de faire tourner toute la chaîne
  (sync → threading → règles → UI → notifications) sans appareil ni identifiants.

