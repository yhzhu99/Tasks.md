FROM node:24.15.0-alpine3.22 AS build-stage

RUN set -eux \
    && mkdir -p /app \
    && mkdir -p /api

COPY frontend/ /app
COPY entrypoint.sh /api/entrypoint.sh

WORKDIR /app
RUN set -eux && npm ci --no-audit --no-fund

COPY backend/ /api/

WORKDIR /api
RUN set -eux && npm ci --no-audit --no-fund

FROM alpine:3.22 AS final
USER root
# Ship the exact same Node.js version used to build the app
COPY --from=build-stage /usr/local/bin/node /usr/local/bin/node
COPY --from=build-stage /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN set -eux && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY --from=build-stage /app /app
COPY --from=build-stage /api/ /api/

VOLUME /tasks
VOLUME /config
WORKDIR /api
EXPOSE 8080

ENTRYPOINT sh entrypoint.sh
