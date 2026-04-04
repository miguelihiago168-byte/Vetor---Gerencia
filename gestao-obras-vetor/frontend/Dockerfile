FROM node:18-alpine AS builder
WORKDIR /app

# Instalar dependências de build necessárias
RUN apk add --no-cache python3 make g++

COPY frontend/package*.json ./

# Limpar cache e instalar com verbose para debug
RUN npm cache clean --force && \
    npm install --legacy-peer-deps

COPY frontend/ .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
