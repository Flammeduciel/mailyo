# Journal des décisions, MailChat / mailyo

Ce fichier consigne les décisions prises pendant la construction du projet.
Chaque décision indique le contexte, le choix retenu et la justification.
Le plan directeur unifié (spécification produit) reste la référence ; ce
journal documente les arbitrages d'implémentation.

Ordre : du plus récent au plus ancien dans chaque section, mais les
sections sont thématiques.

---

## 1. Socle technique

### D-001, Conserver Expo SDK 57 plutôt que React Native CLI nu

- **Contexte :** le dépôt a été initialisé avec `create-expo-app` (Expo SDK 57,
  expo-router, React Native 0.86, React 19).
- **Décision :** rester sur Expo + expo-router au lieu de rétrograder vers un
  projet RN CLI.
- **Justification :** Expo fournit `expo-sqlite`, `expo-secure-store`,
  `expo-notifications`, `expo-auth-session` et `expo-crypto`, soit précisément
  les briques du MVP, avec versions résolues automatiquement. La Génération
  Native Continue (CNG) permet d'ajouter du code natif Android via des config
  plugins sans maintenir `android/` à la main. Cela ne contredit pas la règle
  « pas de backend propriétaire » : Expo n'est pas un backend obligatoire.
- **Conséquence :** les dossiers `android/` et `ios/` sont générés, jamais
  édités à la main.

### D-002, Gestion d'état sans bibliothèque externe

- **Contexte :** le plan demande une « couche repository et gestion d'état
  explicite » qui distingue données synchronisées, cache et état d'interface.
- **Décision :** repositories asynchrones + un `MailService` (composition root)
  exposé par un contexte React (`src/state/app-context.tsx`) et un hook de
  chargement `useServiceQuery` qui se recharge sur un compteur `revision`. Pas de
  Redux/Zustand/MobX, pas de store maison redondant.
- **Justification :** évite une dépendance et une abstraction non justifiées par
  le périmètre MVP. Les repositories restent la source de vérité persistée ;
  l'écran ne connaît que le service. Une migration vers une bibliothèque reste
  possible sans toucher aux repositories.

### D-003, Tests avec jest-expo + Testing Library, colocalisés

- **Décision :** `jest-expo` comme preset, `@testing-library/react-native` pour
  l'UI, tests colocalisés (`*.test.ts` à côté du code).
- **Justification :** preset officiel Expo, gère les mocks natifs des modules
  Expo. Tests colocalisés = le test vit avec la responsabilité qu'il couvre.

### D-004, Design « classique et propre »

- **Décision :** jetons de design centralisés (couleurs, espacements, rayons,
  typographie) dans `src/ui/theme.ts`, composants réutilisables dans `src/ui/`.
  Style sobre : fond neutre, accent unique, bulles de message arrondies, listes
  denses, thème clair/sombre automatique.
- **Justification :** cohérence visuelle, pas de dépendance UI externe, facile à
  faire évoluer.

---

## 2. Architecture

### D-010, Architecture en couches

```
src/app/          routes expo-router (présentation / navigation)
src/ui/           composants de présentation réutilisables
src/state/        AppProvider + useServiceQuery (accès au service)
src/services/     MailService (composition root)
src/domain/       logique métier pure et testable (threading, règles, etc.)
src/data/         SQLite, migrations, repositories, seed
src/providers/    adaptateurs fournisseurs (OAuth/IMAP/SMTP) derrière interfaces
src/sync/         moteur de synchronisation, file d'opérations, arrière-plan
src/notifications/ résolution des règles + publication système
```

- **Décision :** `src/domain/` ne dépend d'aucun module natif ni de React.
- **Justification :** le cœur métier (threading, règles de notification,
  priorité, backoff, assainissement HTML) doit être testable sans appareil.

### D-011, Adaptateurs fournisseurs derrière interfaces, avec implémentation mock

- **Contexte :** la Phase 0 (faisabilité IMAP/IDLE/SMTP/OAuth sur appareil réel)
  ne peut pas être exécutée dans un environnement sans appareil ni identifiants
  Google. Le plan exige de ne pas bloquer le reste sur cette preuve.
- **Décision :** définir les interfaces `MailStore`/`ImapAdapter`/`SmtpAdapter`/
  `OAuthAdapter` et fournir une implémentation en mémoire déterministe
  (`MockMailProvider`) utilisée par l'app et les tests. Les implémentations
  réelles (Gmail OAuth, IMAP IDLE, SMTP) sont des modules à installer en Phase 0
  et implémentent les mêmes interfaces.
- **Justification :** permet de développer et tester toute la chaîne (sync,
  threading, règles, UI) sans dépendance réseau, tout en fixant le contrat des
  adaptateurs réels. Aucune bibliothèque IMAP n'est choisie « parce qu'elle
  marche sous Node ».

### D-012, Regroupement des conversations par fil (threading)

- **Décision :** moteur de threading qui s'appuie en priorité sur `Message-ID`,
  `In-Reply-To`, `References`, avec sujet normalisé en repli prudent. Voir
  `src/domain/threading`.
- **Justification :** règle produit §6.

---

## 3. Données et sécurité

### D-020, SQLite (expo-sqlite) + migrations versionnées

- **Décision :** schéma conforme au §15 du plan, migrations idempotentes
  pilotées par `PRAGMA user_version`.
- **Justification :** socle officiel Expo, supporte SQLCipher via config plugin
  pour le chiffrement au repos (MVP sécurité).

### D-021, Jetons OAuth dans le stockage sécurisé, jamais dans SQLite

- **Décision :** `expo-secure-store` (Android Keystore) pour les jetons ;
  `accounts` ne contient que des métadonnées non secrètes.
- **Justification :** règle produit §12.

### D-022, Assainissement HTML

- **Décision :** le HTML entrant est assaini avant stockage/affichage
  (`src/domain/sanitize`). Aucun rendu HTML actif sans contexte isolé.
- **Justification :** règle produit §7 et §12.

---

### D-013, Identité locale d'un message

- **Contexte :** il faut une clé stable pour rendre la synchronisation
  idempotente et détecter les doublons.
- **Décision :** l'id local d'un message est dérivé du `Message-ID` serveur quand
  il existe (`msg_<hash(accountId, messageId)>`), sinon de
  `(accountId, folderId, UID)`. Deux UID identiques après un changement de
  `UIDVALIDITY` ne créent donc pas de collision lorsqu'un `Message-ID` existe, et
  un même email vu dans deux dossiers met à jour une seule ligne.
- **Justification :** satisfait « détection des doublons et mise à jour
  idempotente » (§5) sans dépendre d'un identifiant local volatil.

### D-014, Réinitialisation sur changement d'UIDVALIDITY

- **Décision :** si `UIDVALIDITY` diffère de la valeur mémorisée, les messages du
  dossier sont supprimés localement puis re-téléchargés intégralement
  (`deleteMessagesInFolder`).
- **Justification :** les UID d'un dossier ne sont plus comparables après un
  changement d'`UIDVALIDITY` ; conserver les anciens provoquerait des
  doublons/erreurs de correspondance.

### D-015, Test de la couche données avec `node:sqlite`

- **Décision :** les repositories dépendent de l'interface `Database`
  (`src/data/db/database.ts`). En production un adaptateur `expo-sqlite`, en test
  un adaptateur en mémoire bâti sur `node:sqlite` (Node 24).
- **Justification :** les tests exécutent le **vrai SQL** et le **vrai schéma**
  sans module natif ni appareil. Ce qui est testé est exactement ce que
  l'appareil exécutera.

### D-016, Service applicatif plutôt que store d'état

- **Décision :** `src/services/mail-service.ts` est le composition root que l'UI
  consomme (bootstrap, sync, envoi, règles, notifications). Il est exposé par
  `src/state/app-context.tsx` (contexte React) et lu par `useServiceQuery`, qui
  recharge les écrans quand `revision` change. Aucun store d'état maison.
- **Justification :** suffisant pour le MVP, directement testable sans React
  (voir `mail-service.test.ts`), cohérent avec « gestion d'état explicite » sans
  ajouter de bibliothèque ni dupliquer la source de vérité.

### D-017, Adaptateurs fournisseurs mockés pour le MVP

- **Décision :** l'application utilise `MockMailProvider` (déterministe, en
  mémoire) derrière l'interface `MailProvider`. Les adaptateurs Gmail/IMAP/SMTP
  réels sont des points d'intégration Phase 0 qui implémentent le même contrat.
- **Justification :** permet de développer et tester toute la chaîne
  réception → threading → règles → notification → UI sans dépendre d'un appareil
  ni d'identifiants Google, sans mentir sur les capacités réelles.

### D-018, Synchro d'arrière-plan périodique (expo-background-task)

- **Décision :** `src/sync/background-sync.ts` enregistre une tâche
  `expo-task-manager` déclenchée par `expo-background-task` (WorkManager Android /
  BGTaskScheduler iOS). Elle rouvre la base et exécute un `MailService.initialize()`
  sans passer par React. Cadence minimale : 15 min.
- **Justification :** c'est la synchronisation d'arrière-plan atteignable sans
  code natif personnalisé, et elle relève réellement les nouveaux messages app
  fermée. La réception **instantanée** (IMAP `IDLE`) exige un service de premier
  plan natif, hors du périmètre Expo managé : point d'intégration documenté, pas
  une promesse tenue à moitié.
- **Conséquence :** `expo-background-task` + `expo-task-manager` sont des
  dépendances assumées, exercées par l'écran `/onboarding`.

### D-030, Service applicatif (`MailService`)

- **Décision :** `src/services/mail-service.ts` séquence repositories, registre de
  fournisseurs, moteur de sync et notifier. L'UI ne connaît que lui. Les
  paramètres applicatifs (contenu des notifications, thème, heures calmes) sont
  stockés dans la table `app_settings` via `src/domain/settings.ts` (pur, testé).
- **Justification :** un seul point de composition, testable avec le vrai SQLite
  en mémoire et `MockMailProvider`, sans appareil.

### D-031, Recherche plein texte FTS5

- **Contexte :** le plan demande une recherche par objet, expéditeur et contenu.
- **Décision :** table virtuelle `messages_fts` (external content) alimentée par
  triggers SQL, requête construite par `buildFtsQuery` (pur, testé) pour échapper
  l'entrée utilisateur et éviter l'injection de syntaxe FTS.
- **Justification :** recherche instantanée côté appareil, sans requête réseau ni
  scan complet.

### D-032, Sons de notification par règle

- **Décision :** les règles `sender`/`domain`/`subject`/`vip` portent un `soundId`
  et un `vibrationMode` ; `evaluateRules` (pur) les résout, `resolve.ts` produit
  le contenu, `channels.ts` mappe vers un canal Android par son, et `notifier.ts`
  publie. Les règles ne s'appliquent qu'aux messages réellement nouveaux et non
  lus provenant d'autrui.
- **Justification :** exigence produit centrale (« son personnalisé par
  expéditeur »), testée de bout en bout en pur.

### D-033, Écrans : rattachement au service, pas aux repositories

- **Décision :** chaque écran (`inbox`, `thread/[id]`, `search`, `compose`,
  `settings`, `rules/edit`, `login`, `onboarding`) lit et mute via `useApp()` /
  `useServiceQuery`. Les valeurs dépendant du temps (`now`) sont calculées dans le
  chargeur asynchrone, jamais pendant le rendu.
- **Justification :** règle de pureté React (`react-hooks`) et un seul chemin de
  données.

### D-034, Sons de notification embarqués

- **Contexte :** les règles et canaux référençaient des fichiers audio
  (`soft.wav`, `urgent.wav`) absents du dépôt : les sons personnalisés seraient
  restés muets.
- **Décision :** générer trois WAV courts (`soft`, `chime`, `urgent`) dans
  `assets/sounds/`, les déclarer dans le config plugin `expo-notifications`
  (`sounds`) et les exposer via `BUILT_IN_SOUNDS`. `expo-audio` (inutilisé) est
  retiré ; l'écoute de test passe par une vraie notification.
- **Justification :** un son personnalisé par expéditeur ne fonctionne que si le
  fichier est embarqué dans le build natif. Assets générés par script, sans
  dépendance de licence.

### D-035, Comptes OAuth créés et gérés, sans transport natif factice

- **Contexte :** l'écran de connexion sauvait les jetons Gmail sous l'identifiant
  factice `gmail-pending`, qu'aucun code ne relisait, et ne créait pas de compte.
- **Décision :** `MailService.connectOAuthAccount()` crée un vrai compte
  (`authType: 'oauth'`) et confie les jetons à un `TokenStore`
  (`expo-secure-store`) fourni au service. L'adresse est résolue via l'endpoint
  userinfo. Les comptes non-démo n'obtiennent **pas** de provider tant que
  l'adaptateur IMAP/SMTP natif n'existe pas : `createProviderFor` renvoie `null`
  et la synchro les ignore, au lieu de faire tourner un faux provider vide.
  `deleteAccountData` supprime aussi les jetons.
- **Justification :** un compte connecté doit être visible et révocable, sans
  prétendre qu'une boîte Gmail vide est synchronisée. Le jour où l'adaptateur
  natif arrive, les jetons sont déjà au bon endroit.

### D-036, Préférence de thème réellement appliquée

- **Contexte :** `AppSettings.theme` était persisté et exposé dans les
  paramètres, mais `useAppTheme` suivait uniquement le thème du système : le
  réglage n'avait aucun effet.
- **Décision :** `ThemePreferenceProvider` (dans `src/ui/theme-preference.tsx`)
  transporte la préférence ; `useAppTheme`/`useResolvedScheme` la combinent avec
  `useColorScheme()`. `AppProvider` détient la préférence (chargée à
  l'initialisation, mise à jour par `setTheme`), et le thème de navigation est
  dérivé du même schéma résolu.
- **Justification :** un réglage affiché doit agir, pas mentir. Le contexte de
  préférence a une valeur par défaut, donc les composants testés hors provider
  continuent de fonctionner.

### D-037, Route d'entrée `/` explicite

- **Contexte :** aucune route `index` n'existait sous `src/app/`. Expo Router
  ouvre l'application sur `/`, qui n'était donc apparié à aucun écran ; les seules
  entrées navigables étaient `/inbox` et `/settings`.
- **Décision :** `src/app/index.tsx` redirige vers `/(tabs)/inbox`. La liste des
  conversations porte l'état « rien pour l'instant » (action « Ajouter un
  compte » vers `/login`), de sorte que l'accueil première ouverture vit à un
  seul endroit. L'écran de fiabilité (`/onboarding`) reste accessible depuis les
  paramètres.
- **Justification :** le point d'entrée doit exister et mener à l'écran qui
  possède déjà le parcours de première ouverture, sans dupliquer cette logique
  dans une route supplémentaire. Testé (`src/app/index.test.tsx`).

### D-038, Version affichée lue depuis la configuration

- **Contexte :** l'écran « À propos » affichait une version codée en dur
  (`0.1.0`) divergente de `app.json`/`package.json` (`1.0.0`).
- **Décision :** lire `Constants.expoConfig?.version` (`expo-constants`) au lieu
  d'une constante littérale.
- **Justification :** une valeur affichée doit refléter le build, pas dériver.

### D-039, Gmail via l'API REST plutôt qu'IMAP/SMTP natif

- **Contexte :** l'OAuth Gmail fonctionnait sur appareil, mais aucun transport
  n'existait : les comptes Gmail restaient vides (D-035). Aucune bibliothèque
  IMAP ne tourne en React Native sans module natif.
- **Décision :** `GmailApiProvider` (`src/providers/gmail/`) implémente
  `MailProvider` sur l'API REST Gmail (HTTPS + jeton OAuth) : libellés `INBOX`
  et `SENT`, lecture `format=full`, envoi `messages.send` (MIME brut encodé),
  lu/étoile/archive via `modify`, corbeille via `trash`. `remoteUid` =
  `internalDate` (ms) : entier sûr, croissant, identique dans tous les
  libellés ; l'id Gmail est mis en cache, puis retrouvé après redémarrage via
  `rfc822msgid:`. Le jeton d'accès est renouvelé par la grant `refresh_token`
  (client natif, sans secret) et réécrit dans le stockage sécurisé. Une erreur
  de synchro d'un compte n'interrompt plus les autres ni le démarrage.
- **Justification :** fonctionne immédiatement, en JavaScript pur, sans
  recompiler. L'interface `MailProvider` est inchangée : un adaptateur IMAP
  natif reste branchable plus tard.
- **Limites connues :** pas de temps réel (pas d'IDLE ; le push Gmail exige
  Pub/Sub côté serveur), les nouveaux mails arrivent à la relève périodique ou
  au rafraîchissement. Seuls les nouveaux messages sont synchronisés : un
  changement lu/non-lu fait ailleurs n'est pas répercuté. Un message envoyé
  depuis Wouah Mail peut apparaître deux fois (copie locale + copie `SENT`). Le
  scope `https://mail.google.com/` est « restreint » : publication hors mode
  Test = validation Google + audit CASA.

### D-040, Interface de messagerie Android (onglets par catégorie, bulles, HTML)

- **Contexte :** demande d'une interface calquée sur les conventions d'une
  messagerie Android (barre du haut, barre d'onglets, bouton flottant, appui
  long, réponses citées, paramètres en liste), mails mal formatés, champ de
  saisie masqué par la barre de navigation.
- **Décision :**
  - Onglets `Discussions · Actus · Groupes · Favoris` d'après les catégories
    Gmail (`CATEGORY_*` → colonne `messages.category`, migration 4) ;
    Paramètres et Archivées passent dans le menu ⋮. Couleur : bleu Wouah Mail,
    sans marque ni logo tiers.
  - Liste : recherche en pilule, filtres (Toutes / Non lus / Pièces jointes),
    épinglage, sélection multiple par appui long, défilement infini (pages
    locales puis `MailProvider.fetchOlderMessages`, Gmail `before:`).
  - Conversation : liste inversée avec séparateurs de jour, citation du
    message parent (`In-Reply-To`) cliquable, swipe pour répondre, sélection
    (répondre, favori, copier, transférer, supprimer), historique cité replié
    (`splitQuotedText`), liens cliquables (`linkify`), HTML riche dans une
    WebView (`react-native-webview`) à hauteur auto, mise à l'échelle des mails
    larges, liens ouverts hors de la WebView. Saisie dans un
    `KeyboardAvoidingView behavior="padding"` + marge de la barre de
    navigation (Android edge-to-edge, guide Expo « keyboard handling »).
  - Le sanitiseur garde désormais les styles en ligne filtrés (`sanitizeCss` :
    ni `expression()`, ni `javascript:`, ni `url()` hors http(s)/data:image,
    ni `position`/`z-index`) et `class`/`id` (repli de `gmail_quote`) : sans
    eux la mise en page des mails était perdue.
- **Limites :** les images distantes se chargent à l'ouverture (pas encore
  d'option « bloquer les images ») ; pas de sélecteur d'emoji ni de pièces
  jointes dans la saisie.

---

### D-041, IMAP/SMTP via un module natif Expo (Jakarta Mail), Microsoft reporté

- **Contexte :** après Gmail (API REST), il faut couvrir les autres boîtes : Yahoo,
  iCloud, Orange, Free, SFR, La Poste, OVH, GMX, Zoho, Fastmail… Une app Expo n'a
  pas de sockets TCP/TLS bruts côté JavaScript.
- **Décision :** un module Expo local (`modules/mailyo-imap`, Kotlin) qui enveloppe
  Jakarta Mail (IMAP + SMTP) et expose une API asynchrone au JS ; un
  `ImapMailProvider` implémente `MailProvider` par-dessus. Android d'abord (cible
  de l'app) ; iOS plus tard (MailCore2). Outlook / Hotmail / Microsoft 365 passera
  par l'API Microsoft Graph dans une étape ultérieure : affiché « Bientôt
  disponible » d'ici là.
- **Justification :** pas de serveur intermédiaire (les mots de passe restent dans
  le stockage sécurisé du téléphone), bibliothèque mature, et le moteur de synchro
  est déjà conçu autour des UID/UIDVALIDITY d'IMAP. Un client IMAP JavaScript sur
  `react-native-tcp-socket` aurait été plus fragile ; une passerelle serveur aurait
  fait transiter les identifiants.
- **Conséquence :** nécessite un development build / APK (pas Expo Go).

### D-042, Commits au nom du propriétaire du dépôt

- **Décision :** aucun commit ne porte de mention « Co-Authored-By », « Claude »,
  « Claude Code » ou « Anthropic » ; l'auteur est le propriétaire du dépôt.

## 4. À trancher plus tard (Phase 0, sur appareil réel)

Ces points du §22 ne peuvent être validés que par prototype sur appareil :
bibliothèque IMAP/SMTP réellement compatible, besoin exact d'un module natif
pour IDLE et le service d'arrière-plan, scopes OAuth Gmail, stratégie de
chiffrement SQLite définitive, licence et distribution (F-Droid). Le code est
structuré pour que ces choix n'impactent que `src/providers/` et un éventuel
module natif.
