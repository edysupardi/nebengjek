FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build api-gateway

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/api-gateway ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:3000/health/liveness', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE 3000
CMD ["node", "dist/main"]