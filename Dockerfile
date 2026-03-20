FROM node:18-alpine

# Install dependencies (git for npm packages, wget for healthcheck)
RUN apk add --no-cache git wget

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (dev deps needed for build)
RUN npm ci

# Copy source code (excluding files in .dockerignore)
COPY . .

# Build-time env vars for Vite client
ARG VITE_TRUST_CENTER_URL
ENV VITE_TRUST_CENTER_URL=${VITE_TRUST_CENTER_URL}

# Build the application
RUN npm run build

# Default port (can be overridden via PORT env var)
EXPOSE 3005

# Start the application
CMD ["npm", "run", "start"]