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

# Keep the official Node Alpine runtime. Copying only the node binary into
# a bare Alpine image drops libstdc++, and the process dies on start with
# "Error relocating ... __si_class_type_infoE: symbol not found".
FROM node:24.15.0-alpine3.22 AS final
USER root

COPY --from=build-stage /app /app
COPY --from=build-stage /api/ /api/

VOLUME /tasks
VOLUME /config
WORKDIR /api
EXPOSE 8080

ENTRYPOINT ["sh", "/api/entrypoint.sh"]
