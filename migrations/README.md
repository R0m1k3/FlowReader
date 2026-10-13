# SQL Migrations

This folder contains versioned database migrations.

The server applies pending `*.up.sql` files in order at startup and records
them in the `schema_migrations` table. `*.down.sql` files are kept for manual
rollbacks.

## Naming Convention

```
{version}_{description}.up.sql
{version}_{description}.down.sql
```

Example:

- `001_create_users.up.sql`
- `001_create_users.down.sql`
