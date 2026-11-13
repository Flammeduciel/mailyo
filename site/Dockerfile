# Site MailYo : fichiers statiques servis par nginx (déploiement Dokploy, Build Path /site).
FROM nginx:1.27-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html confidentialite.html conditions.html styles.css /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
EXPOSE 80
