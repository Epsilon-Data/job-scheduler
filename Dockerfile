FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3005

# Copy .env file for production defaults
COPY .env .env

# Start the application
CMD ["npm", "run", "start"]