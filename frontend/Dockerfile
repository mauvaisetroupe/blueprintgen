# ── Étape 1 : build Vue ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Étape 2 : serveur Nginx non-root (compatible OpenShift) ──────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copie le build Vue dans le dossier servi
COPY --from=builder /app/dist /usr/share/nginx/html

# Copie la config Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copie l'entrypoint qui génère config.js depuis les variables d'environnement
COPY --chmod=755 entrypoint.sh /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
