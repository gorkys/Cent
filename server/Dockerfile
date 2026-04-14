FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY server ./server

EXPOSE 8787

CMD ["node", "./server/index.mjs"]
