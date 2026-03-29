FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production --silent
COPY backend/ .
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]
