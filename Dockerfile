FROM oven/bun:1.4.4
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/merchants/package.json ./apps/merchants/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile

COPY . .
ARG RICKSHARE_SERVICE
ARG VITE_PRIVY_APP_ID
ARG VITE_ARC_RPC_URL
ARG VITE_SEPOLIA_RPC_URL
ENV VITE_API_URL=/api
RUN if [ "$RICKSHARE_SERVICE" = "web" ]; then bun --filter @rickshare/web build; fi

ENV NODE_ENV=production
CMD ["bun", "scripts/start-service.ts"]
