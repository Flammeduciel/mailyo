# Notifications en temps réel

## Deux transports, un contrat

`src/realtime/transport.ts` définit `RealtimeTransport`. Le réglage
`notification.realtimeMode` choisit : `off` | `idle` | `relay`.

| Mode    | État                     | Principe                                                             |
| ------- | ------------------------ | -------------------------------------------------------------------- |
| `off`   | disponible               | Synchro périodique d'arrière-plan (Android décide, ~15 min ou plus). |
| `idle`  | **disponible** (Android) | Connexion IMAP IDLE permanente, sans serveur.                        |
| `relay` | **réservé**              | Push des fournisseurs via un serveur relais MailYo, puis FCM.        |

Dans tous les modes, quand l'app est ouverte : synchro au retour au premier plan,
puis toutes les 30 s (`src/realtime/use-realtime.ts`).

## `idle` — connexion permanente (fait)

- Service Android de premier plan `MailPushService` (type `remoteMessaging`), une
  petite notification fixe « Notifications instantanées ». Redémarre au boot.
- Un fil par compte : `IDLE` sur INBOX, réveil toutes les 9 min (les serveurs
  coupent vers 10-30 min), reconnexion avec délai croissant, reconnexion immédiate
  au retour du réseau, rattrapage des mails manqués par UID.
- Comptes : IMAP (mot de passe) et Gmail via IMAP + XOAUTH2 (portée
  `https://mail.google.com/`), jeton rafraîchi en natif avec le refresh token.
- Config chiffrée (`EncryptedSharedPreferences`), construite par
  `src/realtime/push-config.ts`.
- **Pas de double notification** : en arrière-plan, le service notifie et l'app se
  tait pour les comptes surveillés ; à l'écran, l'app notifie ce que ses synchros
  apportent, sauf les mails arrivés avant son ouverture (déjà notifiés).
- Limites : batterie (une connexion par compte), certains constructeurs tuent les
  services — d'où le bouton « Ne pas restreindre la batterie ». Pas d'iOS.

## `relay` — serveur relais (à faire)

Emplacement : `src/realtime/relay-transport.ts` (`isAvailable() === false`), ligne
« Serveur relais — Bientôt disponible » dans les réglages.

Plan :

1. L'app s'enregistre auprès du relais : jeton FCM + identifiants de comptes (aucun
   contenu de mail, aucun mot de passe).
2. Gmail : le relais (ou l'app avec son jeton) appelle `users.watch` vers un topic
   Pub/Sub ; le relais reçoit `historyId` et envoie un message FCM _data-only_
   « nouveau mail pour le compte X ». Renouveler `watch` tous les ≤ 7 jours.
3. Microsoft Graph : abonnement `/me/mailFolders('inbox')/messages` (≤ ~3 j,
   renouvellement), webhook sur le relais → FCM.
4. L'app reçoit le FCM (expo-notifications / tâche headless), synchronise et
   notifie avec ses propres règles (sonneries par expéditeur, heures calmes).
5. Le service IDLE reste le choix pour les serveurs IMAP sans push.
