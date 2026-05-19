# Backend Docker Modes

This folder supports two Docker modes.

## 1) Development (nodemon + source mount)

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Backend: `http://localhost:5000`
- Health: `http://localhost:5000/api/health`

## 2) Production (optimized runtime)

```bash
docker compose -f docker-compose.prod.yml up --build
```

- Backend: `http://localhost:5000`
- Health: `http://localhost:5000/api/health`

## Files
- `Dockerfile.dev`
- `Dockerfile.prod`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
