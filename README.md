# MailYo

Application email mobile type WhatsApp, en **React Native + Expo**, qui parle
**directement en IMAP/SMTP** (pas de serveur intermédiaire). IMAP IDLE pour la
réception temps réel, notifications avec **sons personnalisés par expéditeur**.

> ⚠️ **Development build obligatoire.** MailYo dépend de modules natifs
> (SQLite, notifications, background task, secure store, biométrie, OAuth2) qui
> ne sont **pas** inclus dans Expo Go. Lancez `npx expo run:android` /
> `npx expo run:ios` ou `eas build --profile development`.

## Stack

- **Expo SDK 57** / React Native 0.86 / React 19, Expo Router (file-based routing).
- **expo-sqlite** — cache local (comptes, dossiers, threads, emails, règles).
- **expo-secure-store** — secrets (mots de passe IMAP, tokens OAuth).
- **expo-notifications** — notifications locales + sons personnalisés (WAV embarqués via le config plugin).
- **expo-background-task** + **expo-task-manager** — relève périodique en arrière-plan.
- **expo-auth-session** + **expo-crypto** — OAuth2 (Gmail).
- **expo-local-authentication** — verrou biométrique.
- **expo-dev-client** — development build (indispensable : les modules natifs
  ci-dessus ne sont **pas** dans Expo Go).

## Démarrer

MailYo ne tourne **pas** dans Expo Go. Deux chemins selon votre machine.

### A. En local (JDK 17+ et SDK Android requis)

```bash
npm install
npx expo run:android   # compile le dev build et l'installe (émulateur ou appareil USB)
```

Le dossier natif (`android/`) est généré par CNG et n'est pas committé.

### B. Via EAS (build cloud, aucun SDK Android local)

```bash
npm install --global eas-cli
eas login
eas build --profile development --platform android   # APK « development » (voir eas.json)
# installez l'APK sur votre téléphone, puis :
npx expo start --dev-client
```

`eas.json` définit les profils `development`, `preview` et `production`.
`expo-dev-client` étant installé, `npx expo start` démarre directement en mode
development build plutôt qu'en Expo Go.

## Structure

```
src/
  app/                     # routes Expo Router (présentation / navigation)
    _layout.tsx            # providers (gesture, safe-area, thème) + AppProvider
    index.tsx              # route d'entrée → redirige vers /(tabs)/inbox
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
npm run sounds:generate   # régénère les sons de notification (assets/sounds/*.wav)
```

## Notes MVP

- Schéma SQLite appliqué idempotemment au démarrage (`PRAGMA user_version`) +
  index plein texte **FTS5** (`messages_fts`) pour la recherche.
- Les implémentations natives Gmail / IMAP IDLE / SMTP restent à écrire dans
  `src/providers/` (elles implémentent l'interface `MailProvider`). La connexion
  Gmail OAuth2 crée déjà un compte et stocke ses jetons dans le stockage
  sécurisé ; en attendant le transport natif, ces comptes ne synchronisent rien.
  La réception **instantanée** (IMAP `IDLE`) exige un service de premier plan
  natif ; en attendant, `expo-background-task` assure une relève périodique.
- Un `MockMailProvider` déterministe, connecté via l'écran de connexion
  (« compte de démonstration »), fait tourner toute la chaîne
  (sync → threading → règles → UI → notifications) sans appareil ni identifiants.
- La cible est **Android** (et iOS). Le **web n'est pas supporté** :
  `expo-sqlite` (wasm), `expo-secure-store`, la biométrie, les notifications et
  les tâches d'arrière-plan n'ont pas d'implémentation web fonctionnelle.
