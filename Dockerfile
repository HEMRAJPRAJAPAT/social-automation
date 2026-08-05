# syntax=docker/dockerfile:1

########################################
# Base: shared OS deps (ffmpeg + espeak-ng are runtime requirements, not
# npm packages — see ARCHITECTURE.md §8 for why espeak-ng is the default,
# free, offline voice provider).
########################################
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg espeak-ng ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

########################################
# Dependencies (full, including dev — the Prisma CLI is needed at runtime
# to run `prisma migrate deploy` on container start)
########################################
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

########################################
# Build: compile TypeScript to dist/
########################################
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

########################################
# Runtime image
########################################
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p storage/output storage/temp storage/cache

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
