# build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && addgroup -S app && adduser -S app -G app
COPY --from=build /app/dist ./dist
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
