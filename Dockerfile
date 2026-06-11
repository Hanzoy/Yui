FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY skills ./skills
COPY src ./src
COPY SECURITY.md SOUL.md ./
RUN mkdir -p config

ENV NODE_ENV=production
ENV YUI_WEB_PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
