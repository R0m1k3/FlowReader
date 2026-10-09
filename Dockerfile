# Multi-stage Dockerfile for FlowReader

# Step 1: Build the React Frontend
FROM node:22-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
# Reproducible install from the lockfile
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Step 2: Build the Go Backend
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /server ./cmd/server

# Step 3: Final Production Image
FROM alpine:3.22
WORKDIR /app
RUN apk add --no-cache wget ca-certificates tzdata \
    && adduser -D -H -u 10001 flowreader
COPY --from=builder /server /app/server
# Static frontend and migrations (read-only for the app user)
COPY --from=web-builder /app/web/dist /app/web/dist
COPY migrations /app/migrations

USER flowreader
EXPOSE 8080
CMD ["/app/server"]
