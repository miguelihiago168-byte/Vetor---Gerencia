FROM node:18-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	chromium \
	ca-certificates \
	fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY backend/package*.json ./
RUN npm install --production --silent
COPY backend/ .
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]
