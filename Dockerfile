FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

COPY package*.json ./
COPY package-lock.json ./

USER root
RUN npm ci --unsafe-perm && npm install pm2 --unsafe-perm
USER pptruser

COPY . .

# Set the correct port
EXPOSE 3000

COPY ecosystem.config.js /app/

CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
