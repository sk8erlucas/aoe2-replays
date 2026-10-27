# Build context: repository root (the web app uses workspace packages).
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/viewer/package.json packages/viewer/
COPY packages/shared/package.json packages/shared/
RUN npm ci

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages packages
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
