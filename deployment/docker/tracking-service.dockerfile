FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build tracking-service

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/tracking-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Health check - FIXED PORT 3006 → 3003
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:3003/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE 3003
# Expose socket.io port for real-time tracking
EXPOSE 3060
CMD ["node", "dist/main"]