# Pinned to a digest, so the same Dockerfile builds the same image next
# month too: the tag moves, the digest does not. To move on purpose,
# take the new "digest" from
#   https://hub.docker.com/v2/repositories/library/node/tags/24-alpine
# and write it here.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

# sqlite CLI: turn.js shells out to it for the coturn per-phone credentials
RUN apk add --no-cache sqlite

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    DEVICES_FILE=/app/data/devices.json

# data/ holds devices.json; node owns /app so npm ci and the app can write
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# deps first, so a source change does not re-run npm ci
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src/ ./src/
COPY --chown=node:node tools/ ./tools/

EXPOSE 8787

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
