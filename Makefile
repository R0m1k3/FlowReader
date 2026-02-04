.PHONY: dev build run test lint clean docker-up docker-down migrate-up migrate-down migrate-create

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

# Database migrations
# Requires: go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
DB_URL ?= postgres://flowreader:flowreader@localhost:5432/flowreader?sslmode=disable

migrate-up:
	migrate -path ./migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path ./migrations -database "$(DB_URL)" down 1

migrate-drop:
	migrate -path ./migrations -database "$(DB_URL)" drop -f

migrate-create:
	@read -p "Migration name: " name; \
	migrate create -ext sql -dir ./migrations -seq $$name

migrate-version:
	migrate -path ./migrations -database "$(DB_URL)" version

# Cleanup
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html
