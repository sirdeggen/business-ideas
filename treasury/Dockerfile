FROM node:22-alpine AS build
WORKDIR /repo
COPY protocol ./protocol
COPY server/package.json server/package-lock.json ./server/
WORKDIR /repo/server
RUN npm ci
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/server/package.json /repo/server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /repo/server/dist ./dist
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/index.js"]
