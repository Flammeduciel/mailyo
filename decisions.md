# Journal des décisions — MailChat / mailyo

Ce fichier consigne les décisions prises pendant la construction du projet.
Chaque décision indique le contexte, le choix retenu et la justification.
Le plan directeur unifié (spécification produit) reste la référence ; ce
journal documente les arbitrages d'implémentation.

Ordre : du plus récent au plus ancien dans chaque section, mais les
sections sont thématiques.

---

## 1. Socle technique

### D-001 — Conserver Expo SDK 57 plutôt que React Native CLI nu

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

### D-002 — Gestion d'état sans bibliothèque externe

- **Contexte :** le plan demande une « couche repository et gestion d'état
  explicite » qui distingue données synchronisées, cache et état d'interface.
- **Décision :** repositories asynchrones + un store minimal basé sur
  `useSyncExternalStore`, sans Redux/Zustand/MobX.
- **Justification :** évite une dépendance et une abstraction non justifiées par
  le périmètre MVP. Le store est testable en isolation. Une migration vers une
  bibliothèque reste possible sans toucher aux repositories.

### D-003 — Tests avec jest-expo + Testing Library, colocalisés

- **Décision :** `jest-expo` comme preset, `@testing-library/react-native` pour
  l'UI, tests colocalisés (`*.test.ts` à côté du code).
- **Justification :** preset officiel Expo, gère les mocks natifs des modules
  Expo. Tests colocalisés = le test vit avec la responsabilité qu'il couvre.

### D-004 — Design « classique et propre »

- **Décision :** jetons de design centralisés (couleurs, espacements, rayons,
  typographie) dans `src/constants/theme.ts`, composants réutilisables dans
  `src/ui/`. Style sobre : fond neutre, accent unique, bulles de message
  arrondies, listes denses, thème clair/sombre automatique.
- **Justification :** cohérence visuelle, pas de dépendance UI externe, facile à
  faire évoluer.

---

## 2. Architecture

### D-010 — Architecture en couches

```
src/app/          routes expo-router (présentation / navigation)
src/ui/           composants de présentation réutilisables
src/state/        store d'application (useSyncExternalStore)
src/domain/       logique métier pure et testable (threading, règles, etc.)
src/data/         SQLite, migrations, repositories, seed
src/providers/    adaptateurs fournisseurs (OAuth/IMAP/SMTP) derrière interfaces
src/sync/         moteur de synchronisation, file d'opérations
src/notifications/ résolution des règles + publication système
```

- **Décision :** `src/domain/` ne dépend d'aucun module natif ni de React.
- **Justification :** le cœur métier (threading, règles de notification,
  priorité, backoff, assainissement HTML) doit être testable sans appareil.

### D-011 — Adaptateurs fournisseurs derrière interfaces, avec implémentation mock

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

### D-012 — Regroupement des conversations par fil (threading)

- **Décision :** moteur de threading qui s'appuie en priorité sur `Message-ID`,
  `In-Reply-To`, `References`, avec sujet normalisé en repli prudent. Voir
  `src/domain/threading`.
- **Justification :** règle produit §6.

---

## 3. Données et sécurité

### D-020 — SQLite (expo-sqlite) + migrations versionnées

- **Décision :** schéma conforme au §15 du plan, migrations idempotentes
  pilotées par `PRAGMA user_version`.
- **Justification :** socle officiel Expo, supporte SQLCipher via config plugin
  pour le chiffrement au repos (MVP sécurité).

### D-021 — Jetons OAuth dans le stockage sécurisé, jamais dans SQLite

- **Décision :** `expo-secure-store` (Android Keystore) pour les jetons ;
  `accounts` ne contient que des métadonnées non secrètes.
- **Justification :** règle produit §12.

### D-022 — Assainissement HTML

- **Décision :** le HTML entrant est assaini avant stockage/affichage
  (`src/domain/sanitize`). Aucun rendu HTML actif sans contexte isolé.
- **Justification :** règle produit §7 et §12.

---

### D-013 — Identité locale d'un message

- **Contexte :** il faut une clé stable pour rendre la synchronisation
  idempotente et détecter les doublons.
- **Décision :** l'id local d'un message est dérivé du `Message-ID` serveur quand
  il existe (`msg_<hash(accountId, messageId)>`), sinon de
  `(accountId, folderId, UID)`. Deux UID identiques après un changement de
  `UIDVALIDITY` ne créent donc pas de collision lorsqu'un `Message-ID` existe, et
  un même email vu dans deux dossiers met à jour une seule ligne.
- **Justification :** satisfait « détection des doublons et mise à jour
  idempotente » (§5) sans dépendre d'un identifiant local volatil.

### D-014 — Réinitialisation sur changement d'UIDVALIDITY

- **Décision :** si `UIDVALIDITY` diffère de la valeur mémorisée, les messages du
  dossier sont supprimés localement puis re-téléchargés intégralement
  (`deleteMessagesInFolder`).
- **Justification :** les UID d'un dossier ne sont plus comparables après un
  changement d'`UIDVALIDITY` ; conserver les anciens provoquerait des
  doublons/erreurs de correspondance.

### D-015 — Test de la couche données avec `node:sqlite`

- **Décision :** les repositories dépendent de l'interface `Database`
  (`src/data/db/database.ts`). En production un adaptateur `expo-sqlite`, en test
  un adaptateur en mémoire bâti sur `node:sqlite` (Node 24).
- **Justification :** les tests exécutent le **vrai SQL** et le **vrai schéma**
  sans module natif ni appareil. Ce qui est testé est exactement ce que
  l'appareil exécutera.

### D-016 — Store d'état maison

- **Décision :** `src/state/store.ts` expose `createStore` + `useSelector`
  (`useSyncExternalStore`), sans dépendance externe.
- **Justification :** suffisant pour le MVP, testable en isolation, cohérent avec
  « gestion d'état explicite » sans ajouter de bibliothèque.

### D-017 — Adaptateurs fournisseurs mockés pour le MVP

- **Décision :** l'application utilise `MockMailProvider` (déterministe, en
  mémoire) derrière l'interface `MailProvider`. Les adaptateurs Gmail/IMAP/SMTP
  réels sont des points d'intégration Phase 0 qui implémentent le même contrat.
- **Justification :** permet de développer et tester toute la chaîne
  réception → threading → règles → notification → UI sans dépendre d'un appareil
  ni d'identifiants Google, sans mentir sur les capacités réelles.

### D-018 — Aucune synchro d'arrière-plan dans le MVP

- **Décision :** ne pas embarquer `expo-background-task`/`expo-task-manager` pour
  l'instant. La synchro d'arrière-plan est explicitement V1 (§5, §8) et dépend
  d'une preuve native (Phase 0).
- **Justification :** éviter une dépendance native inutilisée et une promesse non
  tenue.

---

## 4. À trancher plus tard (Phase 0, sur appareil réel)

Ces points du §22 ne peuvent être validés que par prototype sur appareil :
bibliothèque IMAP/SMTP réellement compatible, besoin exact d'un module natif
pour IDLE et le service d'arrière-plan, scopes OAuth Gmail, stratégie de
chiffrement SQLite définitive, licence et distribution (F-Droid). Le code est
structuré pour que ces choix n'impactent que `src/providers/` et un éventuel
module natif.
