# node:22-slim (Debian), not alpine: Prisma's engines need a real OpenSSL and
# glibc — on musl they fail with "Could not parse schema engine response".
FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# Keep the full node_modules (incl. the prisma CLI): the container applies its
# own migrations on boot, which is what "deploy a service independently" means.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
