FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY package.json ./

RUN mkdir -p uploads logs && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Schema sync (prisma db push) is intentionally NOT run automatically here —
# this container shares a remote database, and auto-applying schema changes
# (with --accept-data-loss) on every restart is unsafe. Run it manually when
# the schema actually changes:
#   docker exec -it businessos-backend-app npx prisma db push
CMD ["sh", "-c", "node prisma/seed.js && node src/server.js"]
