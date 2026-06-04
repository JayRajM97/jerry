# Playwright official image — Chromium + Node 22 + system deps preinstalled.
# Pinned to the same version as the playwright npm package in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# Install dependencies first (better Docker layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the app.
COPY . .

ENV NODE_ENV=production
ENV HEADLESS=true
# Render injects its own PORT; default to 10000 if unset.
ENV PORT=10000

EXPOSE 10000

# Build at container start (not at image build) so the runtime GEMINI_API_KEY env
# from Render is inlined into the Vite bundle. Adds ~30-60s to cold starts only.
CMD ["sh", "-c", "npm run build && npm run start"]
