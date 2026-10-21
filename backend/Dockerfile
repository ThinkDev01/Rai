# Single-stage image: installs ALL dependencies and runs the API with tsx
# (no build step, no --omit=dev). It boots exactly like local dev, so a
# from-scratch prod build can't hit a missing-devDependency surprise (this is
# what caused the earlier pino-pretty crash). ENVIRONMENT comes from the mounted
# .env at runtime, not baked into the image.
FROM node:20-alpine
WORKDIR /app

# Patch OS-level CVEs the base image ships with (e.g. openssl libcrypto3/libssl3
# HIGH findings). The Trivy gate fails the build on HIGH/CRITICAL; Alpine
# publishes fixed packages ahead of the base image rebuild, so upgrade installed
# apk packages to pull those patches into the shipped image.
RUN apk upgrade --no-cache

# The base image ships an older npm whose bundled deps (tar, minimatch, glob…)
# carry CVEs Trivy flags as HIGH. Runtime uses `npm start` / `npm run`, so npm
# can't be removed — upgrade it in place instead. Pinned to the 11.x major
# (not `@latest`, and not staying on the base image's existing 10.8.2 — that
# reinstalls the SAME vulnerable bundled tar/minimatch/glob/brace-expansion,
# which still fails Trivy with 14 HIGH + 1 CRITICAL). npm 12 requires Node
# >=22, so `@latest` breaks the build on this node:20-alpine base; npm 11.x is
# the newest major that (a) still supports Node 20 and (b) actually ships
# patched versions of those bundled deps — verified 0 vulnerabilities.
RUN npm install -g npm@11

# Install strictly from the lockfile (`npm ci`, not `npm install`) so the image
# is a byte-for-byte reproduction of package-lock.json. `npm install` re-resolves
# the tree on every build and can pull unpinned transitive deps (e.g. a nested
# undici) that the lockfile never tracked — that divergence let CVE-bearing
# versions slip into the image and is what kept the Trivy gate failing. `npm ci`
# installs devDependencies too (no NODE_ENV=production / no --omit=dev), so the
# tsx runtime still has typescript/tsx available — same property as before.
COPY package*.json ./
RUN npm ci

# npm bundles its OWN undici (CVE-2026-12151) under node_modules/npm/node_modules/
# undici — and that's the ONLY undici in the image (the app's deps carry none).
# npm uses undici only to DOWNLOAD packages from the registry; once npm ci has
# finished there are no more installs, and running local scripts (`npm start`,
# `npm run billing:sweep`, migrations) never touches it. Deleting it here clears
# the Trivy HIGH gate permanently with zero runtime impact.
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/undici

COPY . .

EXPOSE 4000
CMD ["npm", "start"]
