# Green Touch Pro — full-stack Docker image
# Builds the React frontend and serves it together with the Express API.

FROM node:22-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
# Copy built frontend into the server's public dir (served as static)
COPY --from=frontend /app/dist ./public
ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "index.js"]
