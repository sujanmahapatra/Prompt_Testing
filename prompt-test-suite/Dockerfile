# Prompt Test Suite — containerized (Node + Express). Model runs on Ollama Cloud.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
EXPOSE 5090
CMD ["node", "server.js"]
