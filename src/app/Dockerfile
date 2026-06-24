# syntax=docker/dockerfile:1.7

# ---------- build frontend ----------
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- build backend ----------
FROM node:20-alpine AS app-build
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY app/ ./
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget

COPY --from=app-build /app/package.json ./package.json
COPY --from=app-build /app/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=app-build /app/dist ./dist
COPY --from=app-build /app/src/persistence/migrations ./dist/persistence/migrations
COPY --from=web-build  /web/dist ./public

EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
