# ---- Build Stage ----
FROM node:22-alpine AS build

WORKDIR /app

# Install deps using npm (project has package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build Quasar SPA → dist/spa/
RUN npx quasar build

# ---- Runtime Stage ----
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA from build stage
COPY --from=build /app/dist/spa /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
