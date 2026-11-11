# Feuille de route

## Fait
- Gmail (API REST, OAuth), synchronisation avec progression, notifications locales.
- Pièces jointes (aperçus image / vidéo / PDF, téléchargement, partage, envoi).
- Conversations regroupées par personne, sujets, copies (Cc), spam, abonnements.

## En cours
- **IMAP / SMTP** via le module natif `modules/mailyo-imap` (Android) :
  Yahoo, iCloud, Orange, Free, SFR, La Poste, OVH, GMX, Zoho, Fastmail, et tout
  serveur IMAP (réglages manuels).

## Plus tard
- **Microsoft (Outlook, Hotmail, Live, Microsoft 365)** via l'API Microsoft Graph :
  OAuth (application Azure « tous comptes »), synchronisation par `delta`,
  `conversationId`, dossiers `junkemail` / `archive`, contacts et photos.
  Affiché « Bientôt disponible » sur l'écran de connexion.
- **Notifications en temps réel** : option 1 (relève rapide app ouverte) puis
  option 2 (push Gmail / Graph via un petit relais) — en attente de décision.
- IMAP IDLE dans un service Android de premier plan (temps réel sans serveur).
- iOS pour IMAP (MailCore2).
- Yahoo en OAuth (si Yahoo approuve l'accès Mail) ; d'ici là, mot de passe d'application.
