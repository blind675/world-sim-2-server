# Server

Express TypeScript server running on Node.js 20 with Docker support.

## Prerequisites

- Node.js 20.x
- Docker and Docker Compose (for containerized deployment)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` file with your configuration.

## Development

Run the server in development mode with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## Production Build

Build TypeScript to JavaScript:
```bash
npm run build
npm start
```

## Docker

### Build and run with Docker Compose:
```bash
docker-compose up --build
```

### Build Docker image manually:
```bash
docker build -t server .
docker run -p 3001:3001 server
```

## API Endpoints

- `GET /api/health-check` - Health check endpoint

### Health Check Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-27T20:00:00.000Z",
  "uptime": 123.456,
  "environment": "development"
}
```
