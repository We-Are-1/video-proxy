# Video Proxy Service

A secure proxy service for video streaming that hides original video URLs from clients.

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Create .env file from example:
\`\`\`bash
cp .env.example .env
\`\`\`

3. Update environment variables in .env

4. Start the service:
\`\`\`bash
npm start
\`\`\`

## Development

Run with hot reload:
\`\`\`bash
npm run dev
\`\`\`

## API Endpoints

- GET /health - Health check
- POST /register - Register a video URL
- GET /stream/:hash - Stream video content