# Multi-stage Dockerfile for FlowReader

# Step 1: Build the React frontend
FROM node:22-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
# Reproducible install from the lockfile
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Step 2: Build the Rust backend (static musl binary)
FROM rust:1-alpine AS builder
RUN apk add --no-cache musl-dev gcc
WORKDIR /app
# Dependencies first, so they stay cached while only src/ changes
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src target/release/.fingerprint/flowreader-* target/release/deps/flowreader-*
COPY src ./src
# touch: the copied sources may be older than the placeholder build
RUN touch src/main.rs && cargo build --release --locked && cp target/release/flowreader /server

# Step 3: Final production image
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1
CMD ["/app/server"]
