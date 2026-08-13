FROM node:22-alpine
WORKDIR /repo

COPY overlay/package.json overlay/package-lock.json* ./overlay/
WORKDIR /repo/overlay
RUN npm install

WORKDIR /repo
COPY protocol ./protocol
COPY overlay/src ./overlay/src
COPY overlay/tsconfig.json ./overlay/tsconfig.json

WORKDIR /repo/overlay
RUN npm run build

EXPOSE 8080
CMD ["npm", "start"]
