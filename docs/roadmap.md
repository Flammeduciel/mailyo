# Feuille de route

## Fait
- Gmail (API REST, OAuth), synchronisation avec progression, notifications locales.
- Pièces jointes (aperçus image / vidéo / PDF, téléchargement, partage, envoi).
- Conversations regroupées par personne, sujets, copies (Cc), spam, abonnements.
- **Notifications instantanées** (Android) : connexion IMAP IDLE permanente dans un
  service de premier plan, pour les comptes IMAP et Gmail (IMAP + connexion Google) ;
  relève toutes les 30 s quand l'app est ouverte. Voir `docs/realtime.md`.

## En cours
- **IMAP / SMTP** via le module natif `modules/mailyo-imap` (Android) :
  Yahoo, iCloud, Orange, Free, SFR, La Poste, OVH, GMX, Zoho, Fastmail, et tout
  serveur IMAP (réglages manuels).

## Plus tard
- **Microsoft (Outlook, Hotmail, Live, Microsoft 365)** via l'API Microsoft Graph :
  OAuth (application Azure « tous comptes »), synchronisation par `delta`,
  `conversationId`, dossiers `junkemail` / `archive`, contacts et photos.
  Affiché « Bientôt disponible » sur l'écran de connexion.
- **Serveur relais** (push Gmail Pub/Sub, abonnements Microsoft Graph → FCM) : plus
  économe que la connexion permanente, indispensable pour Microsoft. Emplacement
  prêt (`RelayTransport`, réglage « Bientôt disponible »): voir `docs/realtime.md`.
- iOS pour IMAP (MailCore2).
- Yahoo en OAuth (si Yahoo approuve l'accès Mail) ; d'ici là, mot de passe d'application.
