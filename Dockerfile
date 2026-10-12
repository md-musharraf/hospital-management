# Node 24: the server runs TypeScript natively and uses the built-in node:sqlite.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
# No VOLUME here: Railway rejects it. Attach a Railway volume at /data instead
# (RAILWAY_VOLUME_MOUNT_PATH is picked up automatically for the SQLite file).
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts", "--prod"]
