# Epsilon - Job Scheduler

A job request management system built with Express, React, and TypeScript.

## Running Locally

### Prerequisites
- Node.js 18+
- npm

### Development Mode
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

The application will be available at `http://localhost:3005`

## Running with Docker Compose Locally

### Prerequisites
- Docker
- Docker Compose

### Steps
```bash
# Build the image locally
docker build -t job-scheduler .

# Create .env file with your configuration
cp .env.example .env

# Run with docker-compose
docker compose up -d

# View logs
docker compose logs -f job-scheduler

# Stop the application
docker compose down
```

## Building Docker Image

### Single Architecture Build
```bash
docker build -t job-scheduler .
```

### Multi-Architecture Build (AMD64 + ARM64)
```bash
# Use the provided script
./build-and-push-multiarch.sh
```

## Pushing Docker Image to GitHub Container Registry

### Prerequisites
1. GitHub Personal Access Token with `write:packages` permission
2. Update credentials in push scripts

### Push to GHCR
```bash
# For single architecture
./push-to-ghcr.sh

# For multi-architecture
./build-and-push-multiarch.sh
```

The image will be available at: `ghcr.io/epsilon-data/job-scheduler:latest`

## Environment Variables

See `.env.example` for required configuration:
- `SESSION_SECRET` - Session encryption key
- `GITHUB_CLIENT_ID` - GitHub OAuth app ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app secret
- `GITHUB_REDIRECT_URI` - OAuth callback URL
- `DATABASE_URL` - PostgreSQL connection string