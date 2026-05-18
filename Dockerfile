# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/server.js"]
