# Pedagógico (horários e diários) — pedagogico.familiadenazare.com.br
# Build multi-estágio do Next em modo standalone. Pensado para o Coolify
# (build pack Dockerfile, porta 3000, health check /api/saude).
#
# Variáveis de ambiente no Coolify (ver .env.example):
#   DATABASE_URL          Postgres do Coolify (obrigatória)
#   SESSION_SECRET        segredo longo e aleatório (openssl rand -hex 32)
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   login com Google
#   APP_URL               https://pedagogico.familiadenazare.com.br
#   ROBO_TOKEN            token do robô rpa-pedagogico (leitura dos diários)
#
# As migrations (db/migrations) são aplicadas sozinhas na primeira conexão.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tzdata
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 TZ=America/Sao_Paulo NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/api/saude || exit 1
CMD ["node", "server.js"]
