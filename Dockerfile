# Production image for the Pulse Market web app.
#
# Builds the Vite bundle, then serves it from nginx. nginx also reverse-proxies
# /api to the backend, so the browser only ever talks to one origin. That keeps
# CORS out of the picture in production and means the client is built with no
# VITE_API_URL at all, falling back to same-origin relative /api requests.

FROM oven/bun:1.4-alpine AS builder
WORKDIR /app

# Copy root package.json and lockfile for workspace install
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build web app only (outputs to apps/web/dist)
WORKDIR /app/apps/web
RUN bun run build


FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
