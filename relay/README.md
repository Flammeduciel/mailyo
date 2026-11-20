# Relais Wouah Mail

Petit serveur (Node 22, sans dépendance) qui rend Gmail instantané avec
l'autorisation `gmail.modify`, sans connexion IMAP permanente :

```
Nouveau mail Gmail → Gmail (users.watch) → Cloud Pub/Sub → relais → Firebase (FCM) → téléphone
```

Le relais ne voit jamais le contenu des mails : il garde seulement, par adresse
Gmail, les jetons FCM des téléphones inscrits (`/data/registrations.json`).

## Routes

| Route                  | Rôle                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`          | État (FCM et Pub/Sub configurés ou non)                                                                                              |
| `POST /register`       | Le téléphone s'inscrit : `{ email, fcmToken, accessToken }`. Le jeton Google est vérifié auprès de Google (adresse et client OAuth). |
| `POST /unregister`     | Désinscription (même corps)                                                                                                          |
| `POST /pubsub?token=…` | Abonnement push Pub/Sub ; envoie un message FCM « nouveau mail » à chaque téléphone de l'adresse                                     |

## Variables d'environnement

| Variable                   | Valeur                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | Contenu du JSON du compte de service Firebase (ou ce JSON en base64). **Secret.** |
| `PUBSUB_TOKEN`             | Longue chaîne aléatoire, reprise dans l'URL de l'abonnement Pub/Sub. **Secret.**  |
| `GOOGLE_CLIENT_IDS`        | ID(s) du client OAuth de l'app, séparés par des virgules                          |
| `PORT`                     | 8080 par défaut                                                                   |

## Dokploy

Application, source GitHub (ce repo), branche `master` :

- Build Type : Dockerfile
- Build Path : `/`, Docker File : `relay/Dockerfile`, Docker Context Path : `.`
- Environnement : les trois variables ci-dessus
- Volume : `/data` (persistant)
- Domaine : `wouah-relay.flamme.work`, port `8080`, HTTPS
- Watch Paths : `relay/**`

## Google Cloud (projet `mailyo-514316`)

1. Activer **Cloud Pub/Sub API**.
2. Créer le sujet `gmail-push`.
3. Sur ce sujet, ajouter le principal `gmail-api-push@system.gserviceaccount.com`
   avec le rôle **Diffuseur Pub/Sub** (Pub/Sub Publisher).
4. Créer un abonnement **push** sur `gmail-push` vers
   `https://wouah-relay.flamme.work/pubsub?token=<PUBSUB_TOKEN>`.

L'app lit l'URL du relais et le sujet dans `app.json` (`extra.relayUrl`,
`extra.gmailPushTopic`).
