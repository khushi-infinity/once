# ONCE frontend: Next.js standalone server.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Rewrites point at the backend. Use an internal service DNS name when the
# containers share a Docker network, or the public backend URL otherwise.
ARG BACKEND_URL=http://backend:8000
ARG MCP_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
ENV MCP_URL=$MCP_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
