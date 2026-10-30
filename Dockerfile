FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# floo runs migrate_command and the cron job in this image, so it keeps tsx, the ORM and
# the driver. This layer comes first: it changes only with package-lock.json, so a code-only
# push reuses it instead of uploading it again, and deploys start faster.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/scripts/migrate.ts ./scripts/migrate.ts
# [cron.low-stock] runs scripts/low-stock.ts in this image; it reads the tables from db/schema.ts.
COPY --from=builder --chown=node:node /app/scripts/low-stock.ts ./scripts/low-stock.ts
COPY --from=builder --chown=node:node /app/db/schema.ts ./db/schema.ts
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
# Start the server only. Migrations run once per deploy (migrate_command in floo.app.toml),
# so a cold start does not wait on the database.
CMD ["node", "server.js"]
