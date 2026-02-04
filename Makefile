.PHONY: dev build run test lint clean docker-up docker-down migrate-up migrate-down

# Development
dev:
	go run ./cmd/server

build:
	go build -o bin/server ./cmd/server

run: build
	./bin/server

# Testing
test:
	go test -v ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Linting
lint:
	golangci-lint run

# Docker
docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Database migrations (placeholder for Story 1.2)
migrate-up:
	@echo "Migration system not yet configured (Story 1.2)"

migrate-down:
	@echo "Migration system not yet configured (Story 1.2)"

# Cleanup
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html
