# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server ./cmd/server

# Final stage
FROM alpine:3.19

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget ca-certificates

# Copy binary from builder
COPY --from=builder /server /app/server

# Expose port
EXPOSE 8080

# Run the application
CMD ["/app/server"]
