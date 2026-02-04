# FlowReader

A minimalist, self-hosted RSS/Atom reader focused on simplicity and resource efficiency.

## Quick Start

```bash
# Start with Docker Compose
docker-compose up --build

# Or use Make
make docker-up
```

Access the API: `http://localhost:8080`

## Deployment

### Unraid

A dedicated configuration file `docker-compose.unraid.yaml` is provided for Unraid servers. It pulls the pre-built image from GitHub Container Registry.

1. Copy **only** `docker-compose.unraid.yaml` to your Unraid server (e.g. into `/mnt/user/appdata/flowreader`).
2. Run with Docker Compose:

```bash
docker-compose -f docker-compose.unraid.yaml up -d
```

Note: The configuration uses `/mnt/user/appdata/flowreader/postgres_data` for database persistence.


## Development

```bash
# Run locally (requires Go 1.22+)
make dev

# Run tests
make test

# Lint code
make lint
```

## Project Structure

```
flowreader/
├── cmd/
│   └── server/          # Application entry point
├── internal/
│   ├── domain/          # Business logic (entities, services)
│   ├── handler/         # HTTP handlers
│   └── repository/      # Database access
├── pkg/                 # Shared utilities
└── migrations/          # SQL migrations
```

## Tech Stack

- **Backend**: Go 1.22+ (Chi Router, pgx driver)
- **Database**: PostgreSQL 16+
- **Frontend**: React + Vite (coming in Epic 3)

## Memory Target

Total container footprint: **< 150MB RAM**

## License

MIT
