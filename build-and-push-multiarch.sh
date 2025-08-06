#!/bin/bash

# Variables
GITHUB_USERNAME=""
GITHUB_TOKEN=""
GITHUB_ORG="epsilon-data"
IMAGE_NAME="job-scheduler"
IMAGE_TAG="1.0.0" # Replace with upgraded version as needed

# Full image path
GHCR_IMAGE="ghcr.io/${GITHUB_ORG}/${IMAGE_NAME}"

echo "Setting up Docker buildx for multi-platform builds..."
docker buildx create --name multiarch --use || docker buildx use multiarch

echo "Logging in to GitHub Container Registry..."
echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_USERNAME}" --password-stdin

echo "Building and pushing multi-architecture image..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ${GHCR_IMAGE}:${IMAGE_TAG} \
  -t ${GHCR_IMAGE}:latest \
  --push \
  .

echo "Multi-architecture image pushed successfully!"
echo "Image URL: ${GHCR_IMAGE}:${IMAGE_TAG}"
echo "Platforms: linux/amd64, linux/arm64"