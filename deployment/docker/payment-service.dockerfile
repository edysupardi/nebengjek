FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build payment-service

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/payment-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Set default port if not provided
ENV PAYMENT_PORT=3005

# Health check with dynamic port
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:' + (process.env.PAYMENT_PORT || 3005) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE ${PAYMENT_PORT:-3005}
CMD ["node", "dist/main"]