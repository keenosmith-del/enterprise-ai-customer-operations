FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
RUN npm exec -w backend -- prisma generate && npm run build -w backend
WORKDIR /app/backend
EXPOSE 5050
CMD ["npm", "start"]
