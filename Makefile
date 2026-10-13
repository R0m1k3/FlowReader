.PHONY: dev build run test lint fmt clean web docker-up docker-down docker-logs

# Development (expects a PostgreSQL reachable through DATABASE_URL)
dev:
	cargo run

build:
	cargo build --release

run: build
	./target/release/flowreader

web:
	cd web && npm ci && npm run build

# Testing. Set TEST_DATABASE_URL to also run the database integration test.
test:
	cargo test

lint:
	cargo fmt --check
	cargo clippy --all-targets -- -D warnings

fmt:
	cargo fmt

# Docker
docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Cleanup
clean:
	cargo clean
