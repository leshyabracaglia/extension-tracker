FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATABASE_PATH=/app/data/tracker.db PORT=3000
VOLUME /app/data
EXPOSE 3000
CMD ["npm", "start"]
