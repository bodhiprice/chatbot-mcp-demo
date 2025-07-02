FROM public.ecr.aws/docker/library/node:22-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --production && \
  npm cache clean --force

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]