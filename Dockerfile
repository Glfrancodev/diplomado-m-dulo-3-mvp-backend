# syntax=docker/dockerfile:1
# ============================================================================
# Phoenix Orders API — Dockerfile multi-stage HARDENED
# ----------------------------------------------------------------------------
# Objetivos: imagen final mínima, sin tooling de dev, non-root, señales OK,
# CVEs del SO parcheadas y build cacheable. Sin secretos en build args/env.
# ============================================================================

# ----------------------------------------------------------------------------
# Fase 1 · builder — instala TODAS las deps (incl. dev) y compila TS -> dist/
# El COPY de package*.json ANTES del código maximiza el cache: npm ci solo se
# re-ejecuta si cambian las dependencias, no si cambia el código fuente.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci = instalación determinista desde el lockfile. --mount=type=cache
# reutiliza ~/.npm entre builds sin dejar rastro en la capa (BuildKit).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ----------------------------------------------------------------------------
# Fase 2 · prod-deps — SOLO dependencias de producción (npm ci --omit=dev)
# Instalación limpia desde el lockfile: más determinista y liviana que hacer
# `npm prune` sobre el node_modules de desarrollo.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ----------------------------------------------------------------------------
# Fase 3 · production — runtime mínimo: node + dist + node_modules(prod), nada más
# ----------------------------------------------------------------------------
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Metadatos OCI (auditables con `docker inspect` / escáneres).
LABEL org.opencontainers.image.title="phoenix-orders-api" \
      org.opencontainers.image.description="API REST NestJS - Phoenix Orders (MVP)" \
      org.opencontainers.image.source="https://github.com/Glfrancodev/diplomado-m-dulo-3-mvp-backend"

# UN solo RUN (menos capas):
#  - apk upgrade  -> parchea CVEs del SO base (baja el conteo de Scout/Trivy).
#  - tini         -> init liviano como PID 1: reap de zombies + reenvío de señales
#                    (SIGTERM) para shutdown graceful de Nest. Node como PID 1 no
#                    reapea hijos y maneja señales de forma incompleta.
#  - --no-cache   -> no deja el índice de apk en la capa (imagen más chica).
RUN apk upgrade --no-cache && apk add --no-cache tini

# Solo el artefacto de runtime, con dueño no-root desde el propio COPY.
# node:22-alpine ya trae el usuario 'node' (uid/gid 1000) -> no reinventamos.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder  --chown=node:node /app/dist ./dist
COPY --from=builder  --chown=node:node /app/package.json ./

# Non-root: si comprometen el contenedor, el atacante NO es root.
USER node

# Informativo (el publish real de puertos lo hace docker run / compose).
EXPOSE 3000

# Healthcheck nativo: usa fetch() (nativo en Node 22), sin curl/wget extra.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini como PID 1.
ENTRYPOINT ["/sbin/tini", "--"]
# `exec` reemplaza al shell por node -> node recibe las señales directamente.
# Corre migraciones (TypeORM) y, solo si pasan, arranca la API en dist/main.js.
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js && exec node dist/main.js"]
