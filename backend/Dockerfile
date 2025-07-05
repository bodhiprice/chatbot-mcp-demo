FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --production && npm cache clean --force

EXPOSE 3001

CMD ["node", "dist/index.js"]
