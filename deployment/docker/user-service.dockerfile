FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build user-service

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/user-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Add AWS X-Ray for tracing in production
RUN if [ "$NODE_ENV" = "production" ] ; then \
      apk --no-cache add curl && \
      curl -o /tmp/aws-xray-daemon.rpm https://s3.amazonaws.com/aws-xray-assets.us-east-1/xray-daemon/aws-xray-daemon-3.x.rpm && \
      apk --no-cache add ca-certificates; \
    fi

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE 3001
CMD ["node", "dist/main"]