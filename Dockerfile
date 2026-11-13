FROM node:22-slim

# Установка зависимостей для компиляции нативных модулей
RUN apt-get update && apt-get install -y python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
