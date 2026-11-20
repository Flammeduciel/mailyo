# Relais Wouah Mail : notifications push Gmail (Pub/Sub) vers Firebase Cloud Messaging.
# Dokploy : Build Path « / », Docker File « relay/Dockerfile », Context « . »
FROM node:22-alpine
WORKDIR /app
COPY relay/server.mjs ./server.mjs
ENV PORT=8080 DATA_FILE=/data/registrations.json
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
