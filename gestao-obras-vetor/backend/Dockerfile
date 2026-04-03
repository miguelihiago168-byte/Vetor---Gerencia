FROM node:18-alpine
WORKDIR /app

RUN apk add --no-cache \
	chromium \
	nss \
	freetype \
	harfbuzz \
	ca-certificates \
	ttf-freefont \
	font-noto \
	fontconfig

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY backend/package*.json ./
RUN npm install --production --silent
COPY backend/ .
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]
