# UI service: builds the SPA, then serves it from nginx which also proxies
# API paths to the auth/tools services over the internal network (ADR 0006).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Vite inlines VITE_* at build time; the Google client id must match the auth
# service's GOOGLE_CLIENT_ID. VITE_API_URL stays empty: same-origin via nginx.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} VITE_API_URL=
RUN npm run build

FROM nginx:1.27-alpine
# Where the API upstreams live on the deploy network; override per environment.
ENV AUTH_UPSTREAM=http://auth:3000 \
    TOOLS_UPSTREAM=http://tools:3000
COPY nginx/proxy-common.conf /etc/nginx/proxy-common.conf
# The stock entrypoint runs envsubst over /etc/nginx/templates/*.template.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
