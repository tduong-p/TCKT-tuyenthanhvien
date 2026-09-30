# syntax=docker/dockerfile:1
# Interview system: React frontend (built by Vite) served by the Express backend.

FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim
LABEL org.opencontainers.image.source=https://github.com/phamvietbach2006-max/k71-interview-system
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
# Org config baked in; override with a volume + ORG_CONFIG / ORG_ASSETS_DIR
COPY config/ ./config/
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]
