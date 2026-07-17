# syntax=docker/dockerfile:1
#
# Frontend image — builds the Vite/React SPA and serves it with nginx.
# nginx also reverse-proxies /api/* to the backend service, so the browser
# talks to a single origin (no CORS, cookies + CSRF Origin checks just work).

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
