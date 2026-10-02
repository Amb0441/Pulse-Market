# Production image for the Pulse Market API.
#
# Multi-stage: dependencies are installed once in a builder and only the
# runtime artifacts are copied forward, so the shipped image contains no
# devDependencies, no source maps and no build cache.

FROM oven/bun:1.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun apps/api/package.json ./apps/api/
COPY --chown=bun:bun apps/api/tsconfig.json ./
COPY --chown=bun:bun apps/api/src ./src

# Run as the unprivileged `bun` user that ships with the official image. The API
# holds a Supabase service-role key, so a container escape should not land on
# root. Deliberately not creating a new user: if the adduser step ever failed on
# a base-image update, the --chown below would break the build.
USER bun

EXPOSE 3000

# The API is stateless, so SIGTERM must reach the process directly: the graceful
# shutdown handler in server.ts drains in-flight requests before exiting.
STOPSIGNAL SIGTERM

# Uses /api/health, which is a real route on this server. The previous
# production file probed "/" on the frontend port, which never existed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun --eval "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "run", "src/server.ts"]
