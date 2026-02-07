# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Enable corepack so you can use pnpm if you later add it; harmless otherwise
RUN corepack enable

COPY package*.json ./
# If you use pnpm-lock.yaml, copy it too.
# COPY pnpm-lock.yaml ./

# Use npm for now (you don't have pnpm listed in package.json tooling)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# App listens on PORT; we still expose for documentation
EXPOSE 3001

CMD ["node", "dist/index.js"]
