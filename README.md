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
    _layout.tsx            # providers (gesture, safe-area, thème) + AppProvider
    (tabs)/
      _layout.tsx          # onglets Réception / Paramètres
      inbox/index.tsx      # liste des conversations
      settings/index.tsx   # comptes, notifications, règles, fiabilité
    thread/[id].tsx        # conversation (bulles + réponse)
    compose.tsx            # nouveau message (SMTP)
    search.tsx             # recherche plein texte (FTS5)
    login.tsx              # démo + connexion Gmail OAuth2
    onboarding.tsx         # fiabilité notifications / batterie / arrière-plan
    rules/edit.tsx         # création / édition d'une règle de notification
  ui/                      # design system (AppText, Button, Chips, Screen…)
  state/                   # AppProvider + useServiceQuery (accès au service)
  services/                # MailService : composition root de l'application
  domain/                  # cœur métier pur et testable (threading, règles, recherche…)
  data/                    # SQLite, migrations, repositories
    db/                    # abstraction Database + adaptateur expo-sqlite + schéma + FTS5
    repositories/          # accès typés aux tables (accounts, messages, threads, settings…)
  providers/               # contrats fournisseurs + MockMailProvider + OAuth Gmail
  sync/                    # moteur de synchronisation + file d'opérations + arrière-plan
  notifications/           # résolution des règles + canaux + publication système
  constants/config.ts      # constantes (timeouts IMAP, nom de base, canal…)
  hooks/                   # useColorScheme
```

## Configuration native (CNG)

Aucun dossier `ios/` / `android/` n'est committé : la config vit dans
`app.json` (permissions Android, plugins) et est régénérée au build.
Permissions Android : `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`.
`expo-background-task` enregistre une sync périodique (`src/sync/background-sync.ts`).

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
- Les implémentations natives Gmail / IMAP IDLE / SMTP restent à écrire dans
  `src/providers/` (elles implémentent l'interface `MailProvider`). La réception
  **instantanée** (IMAP `IDLE`) exige un service de premier plan natif ; en
  attendant, `expo-background-task` assure une relève périodique.
- Un `MockMailProvider` déterministe, connecté via l'écran de connexion
  (« compte de démonstration »), fait tourner toute la chaîne
  (sync → threading → règles → UI → notifications) sans appareil ni identifiants.


