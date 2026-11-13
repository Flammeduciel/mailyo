# Site MailYo : fichiers statiques servis par nginx.
# Contexte de build = racine du repo (Dokploy : Build Path « / », Docker File « site/Dockerfile »).
FROM nginx:1.27-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/index.html site/confidentialite.html site/conditions.html site/styles.css /usr/share/nginx/html/
COPY site/assets /usr/share/nginx/html/assets
EXPOSE 80
