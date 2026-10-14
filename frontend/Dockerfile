FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]
