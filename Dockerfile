FROM node:22-alpine AS build

WORKDIR /app

ENV HUSKY=0

RUN apk add --no-cache git
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

ARG VITE_GTAG_SCRIPT=
ARG VITE_LOGIN_API_HOST=http://localhost
ARG VITE_POSTGRES_API_HOST=/api/postgres
ARG VITE_POSTGRES_PROXY_TARGET=http://127.0.0.1:3459
ARG VITE_RATE_API_HOST=http://localhost

ENV VITE_GTAG_SCRIPT=${VITE_GTAG_SCRIPT}
ENV VITE_LOGIN_API_HOST=${VITE_LOGIN_API_HOST}
ENV VITE_POSTGRES_API_HOST=${VITE_POSTGRES_API_HOST}
ENV VITE_POSTGRES_PROXY_TARGET=${VITE_POSTGRES_PROXY_TARGET}
ENV VITE_RATE_API_HOST=${VITE_RATE_API_HOST}

RUN npx vite build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
