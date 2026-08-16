# Prompt Rater — containerized (Node + Express).
# The model runs on Ollama Cloud, so this image stays tiny and needs no GPU.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better build-layer caching.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the rest of the app.
COPY . .

EXPOSE 5080
CMD ["node", "server.js"]
