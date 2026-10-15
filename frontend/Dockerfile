# One image per web app (the shell or a microfrontend), built from this workspace:
#   docker build -f frontend/Dockerfile --build-arg APP=overview --build-arg TARGET_DIR=/mfe/overview frontend
# Each image serves static files with unprivileged nginx behind the edge proxy.

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# pnpm comes from the hash-pinned packageManager field.
RUN corepack enable
WORKDIR /src

# Dependency layers do not depend on APP, so all six builds share them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile

ARG APP
RUN test -n "$APP" && pnpm --filter "@databix/${APP}" run build

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:782bb89768cc87b7f95c18b95baa1af250e5d451f26794f59363540161147c01
ARG APP
# "shell" for the shell, "remote" for a microfrontend.
ARG KIND=remote
# Where the build is served from: "" for the shell, /mfe/<name> for a remote.
ARG TARGET_DIR=""
COPY nginx/${KIND}.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/${APP}/dist /usr/share/nginx/html${TARGET_DIR}
EXPOSE 8080
