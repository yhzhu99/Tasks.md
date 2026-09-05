FROM node:24.15.0-alpine3.22 AS build-stage

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG BASE_PATH=/
RUN npm run build -- --base=${BASE_PATH}

WORKDIR /api
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm test && npm prune --omit=dev --no-audit --no-fund && rm -rf test

# Keep Node's complete Alpine runtime, including its required shared libraries.
FROM node:24.15.0-alpine3.22 AS final
WORKDIR /api
COPY --from=build-stage --chown=node:node /api/ /api/
COPY --from=build-stage --chown=node:node /app/dist/ /api/static/
COPY --chown=node:node entrypoint.sh /api/entrypoint.sh
RUN mkdir -p /tasks /config && chown node:node /tasks /config
ENV TASKS_DIR=/tasks CONFIG_DIR=/config
USER node
VOLUME /tasks
VOLUME /config
EXPOSE 8080
ENTRYPOINT ["sh", "/api/entrypoint.sh"]
