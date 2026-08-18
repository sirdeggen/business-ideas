FROM node:22-alpine AS builder
WORKDIR /repo
COPY protocol ./protocol
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /repo/frontend
RUN npm install
COPY frontend ./
ARG VITE_OVERLAY_URL=http://localhost:8083
ARG VITE_BASE=/
ENV VITE_OVERLAY_URL=$VITE_OVERLAY_URL
ENV VITE_BASE=$VITE_BASE
RUN npm run build

FROM nginx:alpine
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
