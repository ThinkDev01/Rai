# ── Development stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Builder stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# All NEXT_PUBLIC_* must be declared as ARG and promoted to ENV here, or
# `next build` won't bake them into the client bundle (.env is dockerignored,
# so these build args are the ONLY source of values during the image build).
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_COGNITO_REGION
ARG NEXT_PUBLIC_COGNITO_POOL_ID
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_DOMAIN
ARG NEXT_PUBLIC_OAUTH_SIGNIN_URL
ARG NEXT_PUBLIC_OAUTH_SIGNOUT_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_COGNITO_REGION=$NEXT_PUBLIC_COGNITO_REGION \
    NEXT_PUBLIC_COGNITO_POOL_ID=$NEXT_PUBLIC_COGNITO_POOL_ID \
    NEXT_PUBLIC_COGNITO_CLIENT_ID=$NEXT_PUBLIC_COGNITO_CLIENT_ID \
    NEXT_PUBLIC_COGNITO_DOMAIN=$NEXT_PUBLIC_COGNITO_DOMAIN \
    NEXT_PUBLIC_OAUTH_SIGNIN_URL=$NEXT_PUBLIC_OAUTH_SIGNIN_URL \
    NEXT_PUBLIC_OAUTH_SIGNOUT_URL=$NEXT_PUBLIC_OAUTH_SIGNOUT_URL
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Patch OS-level CVEs the base image ships with. The Trivy gate fails the build
# on HIGH/CRITICAL findings; Alpine periodically publishes fixed packages (e.g.
# openssl libcrypto3/libssl3) ahead of the base image being rebuilt. Upgrading
# installed apk packages pulls those patched versions into the shipped image.
RUN apk upgrade --no-cache
# The standalone build runs `node server.js` and never invokes npm/yarn. They are
# only pre-installed by the base image and drag in CVEs (tar, minimatch, glob…)
# that Trivy flags as HIGH. Remove them so the shipped image carries zero of them.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm /usr/local/bin/npx \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
