# Runtime image for the whole app: API + built Vue SPA on one port.
#
# The server runs TypeScript directly via tsx (no compile step), so the runtime
# needs the full dependency set — we install once, build the frontend, and ship
# it. MySQL is NOT in here; it's a separate compose service the app connects to.
#
# The frontend is built at image-build time; the container's only boot-time work
# is `seed` (offline, idempotent — loads data/enriched/listings.json) then serve.
FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first for layer caching — only the manifests, so `npm ci` is
# reused until a lockfile actually changes.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# App source. web/dist and .env are excluded via .dockerignore — dist is built
# below, and the API key only ever arrives as a runtime env var.
COPY . .

# Build the SPA into web/dist, which the server serves from a single port.
RUN npm --workspace web run build

ENV NODE_ENV=production
EXPOSE 3004

# Boot: apply schema + seed (waits on MySQL via the pool's connect-retry), then
# serve. seed is idempotent, so a container restart never duplicates rows.
CMD ["sh", "-c", "npm run seed && npm run serve"]
