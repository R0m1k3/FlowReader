# Multi-stage Dockerfile for FlowReader

# Step 1: Build the React Frontend
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Step 2: Build the Go Backend
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod tidy
RUN go mod download
# Copy the built frontend from Step 1
COPY --from=web-builder /app/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server ./cmd/server

# Step 3: Final Production Image
FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache wget ca-certificates
COPY --from=builder /server /app/server
# Copy the static files for the Go server to serve
COPY --from=builder /app/web/dist /app/web/dist
# Copy migration files for auto-migration
COPY --from=builder /app/migrations /app/migrations

EXPOSE 8080
CMD ["/app/server"]
