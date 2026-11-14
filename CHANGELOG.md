# Journal des versions

Toutes les évolutions notables de Wouah Mail. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté

- **Application** : parcours complet câblé sur `MailService`: réception
  (conversations groupées en fils), conversation, nouveau message, recherche,
  paramètres, connexion (démo + Gmail OAuth2), onboarding.
- **Recherche plein texte** FTS5 (objet, expéditeur, contenu), requête assainie.
- **Règles de notification** par expéditeur / domaine / objet : sonnerie et
  vibration configurables, activables, avec écoute de test.
- **Sons personnalisés** embarqués (`soft`, `chime`, `urgent`) déclarés dans le
  config plugin `expo-notifications`.
- **Synchronisation d'arrière-plan** périodique (`expo-background-task`) et écran
  d'aide à la fiabilité (notifications, batterie).
- **Verrouillage biométrique** (Face ID / empreinte) activable dans les
  paramètres.
- **Paramètres applicatifs** persistés (`app_settings`) : contenu des
  notifications, thème, verrou biométrique, heures calmes (domaine).
- **Gestion des comptes** : connexion Gmail OAuth2 (jetons dans le stockage
  sécurisé, adresse résolue via l'endpoint userinfo) et retrait d'un compte avec
  confirmation. La synchro IMAP native reste à brancher.

### Modifié

- Couche d'état : contexte React (`AppProvider` + `useServiceQuery`) au lieu d'un
  store maison redondant.
- Design system : composant `Chips` partagé, thèmes clair/sombre centralisés et
  réellement appliqués selon la préférence utilisateur (plus seulement le
  système).
- Nettoyage du gabarit Expo inutilisé et de `expo-audio` (non utilisé).

### Sécurité

- Les secrets (jetons OAuth, mots de passe) vivent dans `expo-secure-store`,
  jamais dans SQLite.

## [0.1.0]

### Ajouté

- Socle : Expo SDK 57 + expo-router, TypeScript, ESLint/Prettier, jest-expo.
- Cœur métier pur et testé (`src/domain`) : threading, règles, assainissement
  HTML, backoff, déduplication, identifiants, MIME, en-têtes de réponse.
- Couche données : abstraction `Database` (expo-sqlite / node:sqlite en test),
  schéma versionné (`PRAGMA user_version`), repositories typés.
- Fournisseurs : contrats `MailProvider` / `OAuthAdapter`, `MockMailProvider`
  déterministe (compte de démonstration), squelette OAuth2 Gmail.
- Notifications : évaluation des règles, canaux Android, publication système.
- Moteur de synchronisation différentiel + file d'opérations.

[Non publié]: https://example.com/mailyo/CHANGELOG
[0.1.0]: https://example.com/mailyo/releases/tag/v0.1.0
