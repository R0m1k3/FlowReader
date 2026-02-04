# SQL Migrations

This folder contains versioned database migrations.

Migrations are managed using `golang-migrate`.

## Naming Convention

```
{version}_{description}.up.sql
{version}_{description}.down.sql
```

Example:

- `001_create_users.up.sql`
- `001_create_users.down.sql`

## Commands

```bash
# Apply all pending migrations
make migrate-up

# Rollback last migration
make migrate-down
```
