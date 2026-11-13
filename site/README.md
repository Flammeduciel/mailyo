# Site MailYo

Site statique (HTML + CSS, sans dépendance ni outil de build) : page d'accueil,
politique de confidentialité et conditions d'utilisation. Il reprend la palette
« encre » de l'application (`src/ui/theme.ts`) et suit le thème clair/sombre du
navigateur.

| Fichier                 | Rôle                                               |
| ----------------------- | -------------------------------------------------- |
| `index.html`            | Page d'accueil                                     |
| `confidentialite.html`  | Politique de confidentialité (exigences Google)    |
| `conditions.html`       | Conditions d'utilisation                           |
| `styles.css`            | Styles communs                                     |
| `assets/`               | Icône de l'app (favicon, apple-touch-icon, 512 px) |

Aperçu local : ouvrir `index.html` dans un navigateur, ou `npx serve site`.

## Déploiement (Dokploy)

Application, source GitHub, branche `master`, puis :

- Build Path : `/` (racine du repo)
- Build Type : Dockerfile
- Docker File : `site/Dockerfile`
- Docker Context Path : `.`
- Domaine : port `80`, HTTPS
- Watch Paths (facultatif) : `site/**`

Test local : `docker build -f site/Dockerfile -t mailyo-site . && docker run -p 8080:80 mailyo-site`.

## Avant publication

Remplacer les éléments surlignés en jaune (classe `todo`) et l'adresse de contact :

- `[nom de l'éditeur ou de la société]` et `[adresse postale]` (confidentialité §2, conditions §1) ;
- `[du pays de l'éditeur]` (conditions §12) ;
- `contact@mailyo.app` : adresse de contact réelle (toutes les pages, pied de page compris) ;
- le bouton « Bientôt disponible sur Google Play » : lien vers la fiche Play Store une fois publiée.

## Console Google (écran de consentement OAuth)

1. Héberger le dossier sur un domaine à vous (GitHub Pages, Netlify, Cloudflare Pages…).
2. Vérifier ce domaine dans Google Search Console avec le même compte Google.
3. Dans « Écran de consentement OAuth » › « Branding » :
   - Page d'accueil de l'application : `https://<domaine>/`
   - Règles de confidentialité : `https://<domaine>/confidentialite.html`
   - Conditions d'utilisation : `https://<domaine>/conditions.html`
   - Domaines autorisés : `<domaine>`
   - Logo : `assets/icon-512.png` (carré, 120 px minimum).

La politique de confidentialité liste les autorisations réellement demandées par
l'app (`src/app/login.tsx`) : `https://mail.google.com/`, `userinfo.email`,
`contacts.readonly`, `contacts.other.readonly`, et contient la mention
d'utilisation limitée (« Limited Use ») exigée par Google. Si une autorisation
change dans l'app, mettre à jour le tableau de la section 4.
