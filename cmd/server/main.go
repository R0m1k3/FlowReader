package main

import (
	"context"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/michael/flowreader/internal/config"
	"github.com/michael/flowreader/internal/database"
	"github.com/michael/flowreader/internal/handler"
	"github.com/michael/flowreader/internal/repository"
	"github.com/michael/flowreader/internal/service"
	"github.com/michael/flowreader/internal/worker"
	"github.com/michael/flowreader/internal/ws"
)

func main() {
	// PWA manifest: Go's mime table doesn't know this extension.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")

	// Load configuration
	cfg := config.Load()

	// Initialize database connection pool
	ctx := context.Background()
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer pool.Close()

	// Apply pending migrations (warning only, doesn't block)
	if err := database.RunMigrations(ctx, pool); err != nil {
		log.Printf("Migration check warning: %v", err)
	}

	// Initialize repositories
	userRepo := repository.NewUserRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)
	feedRepo := repository.NewFeedRepository(pool)
	articleRepo := repository.NewArticleRepository(pool)

	// Initialize services
	authService := service.NewAuthService(userRepo, sessionRepo)
	feedService := service.NewFeedService(feedRepo)
	aiService := service.NewAIService()

	// Initialize WS Hub
	hub := ws.NewHub()
	go hub.Run()

	// Keep outbound fetch concurrency modest so it doesn't starve the
	// 10-connection DB pool used by API requests.
	fetchService := service.NewFetchService(feedRepo, articleRepo, hub, 4)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(authService)
	feedHandler := handler.NewFeedHandler(feedService, fetchService, authService)
	articleHandler := handler.NewArticleHandler(articleRepo, aiService, hub)
	wsHandler := handler.NewWSHandler(hub, authService)
	adminHandler := handler.NewAdminHandler(userRepo, authService)

	// Start background workers. Each feed carries its own next_fetch_at; the
	// fetcher only looks for due feeds every minute.
	fetcher := worker.NewFeedFetcher(fetchService, time.Minute, 4)
	fetcher.Start()
	defer fetcher.Stop()

	cleaner := worker.NewCleaner(articleRepo, authService, 24*time.Hour)
	cleaner.Start()
	defer cleaner.Stop()

	requireAuth := handler.RequireAuth(authService)

	// Initialize router
	r := chi.NewRouter()

	// Note: no middleware.RealIP — client IPs come from RemoteAddr, and
	// X-Forwarded-For is only honoured from TRUSTED_PROXIES (see handler).
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(handler.SecurityHeaders)

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			http.Error(w, "Database connection failed", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"flowreader"}`))
	})

	// API routes
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(handler.SameOriginGuard)
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Cache-Control", "no-store")
				next.ServeHTTP(w, r)
			})
		})

		// Regular JSON endpoints: compressed, 1 MiB bodies, 30s budget.
		api.Group(func(r chi.Router) {
			r.Use(middleware.Compress(5, "application/json", "application/xml", "text/plain"))
			r.Use(handler.LimitBody(1 << 20))
			r.Use(middleware.Timeout(30 * time.Second))

			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"message":"FlowReader API v1"}`))
			})

			// Auth routes (public) — rate-limited to mitigate brute-force attacks.
			r.Route("/auth", func(r chi.Router) {
				r.Use(handler.NewAuthRateLimiter())
				r.Post("/register", authHandler.Register)
				r.Post("/login", authHandler.Login)
				r.Post("/logout", authHandler.Logout)
			})

			// Everything below requires a valid session (one SQL lookup).
			r.Group(func(r chi.Router) {
				r.Use(requireAuth)

				r.Get("/users/me", authHandler.Me)

				r.Route("/feeds", func(r chi.Router) {
					r.Get("/", feedHandler.List)
					r.Post("/", feedHandler.Add)
					r.Post("/refresh", feedHandler.Refresh)
					r.Get("/export/opml", feedHandler.ExportOPML)
					r.Get("/{id}", feedHandler.Get)
					r.Patch("/{id}", feedHandler.Update)
					r.Delete("/{id}", feedHandler.Delete)
					r.Get("/{id}/articles", articleHandler.ListByFeed)
					r.Post("/{id}/read-all", articleHandler.MarkAllRead)
				})

				r.Route("/articles", func(r chi.Router) {
					r.Get("/", articleHandler.List)
					r.Get("/search", articleHandler.Search)
					r.Post("/read-all", articleHandler.MarkAllReadGlobal)
					r.Get("/favorites", articleHandler.GetFavorites)
					r.Get("/{id}", articleHandler.Get)
					r.Post("/{id}/read", articleHandler.MarkRead)
					r.Delete("/{id}/read", articleHandler.MarkUnread)
					r.Post("/{id}/favorite", articleHandler.ToggleFavorite)
				})

				r.Route("/admin", func(r chi.Router) {
					r.Use(adminHandler.AdminOnly)
					r.Get("/users", adminHandler.ListUsers)
					r.Delete("/users/{id}", adminHandler.DeleteUser)
				})
			})
		})

		// OPML import: larger body.
		api.With(handler.LimitBody(5<<20), middleware.Timeout(60*time.Second), requireAuth).
			Post("/feeds/import/opml", feedHandler.ImportOPML)

		// AI summaries: slow (page extraction + LLM) and costly, so a longer
		// budget and a per-user rate limit.
		api.With(handler.LimitBody(1<<10), requireAuth, handler.NewUserRateLimiter(6, 3), middleware.Timeout(90*time.Second)).
			Post("/articles/{id}/summarize", articleHandler.Summarize)

		// WebSocket: no compression or timeout middleware (hijacked conn).
		api.With(requireAuth).Get("/ws", wsHandler.Connect)
	})

	// Serve Static Files (Frontend)
	staticPath := "./web/dist"
	if _, err := os.Stat(staticPath); err == nil {
		r.Group(func(r chi.Router) {
			r.Use(middleware.Compress(5, "text/html", "text/css", "application/javascript", "text/javascript", "image/svg+xml", "application/manifest+json"))
			r.Handle("/*", spaHandler(staticPath))
		})
	}

	// Create server
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      35 * time.Second, // summarize extends its own deadline
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited properly")
}

// spaHandler serves the built frontend: hashed assets are cached forever,
// HTML / service worker files must revalidate, unknown paths fall back to
// index.html for client-side routing.
func spaHandler(root string) http.Handler {
	fs := http.FileServer(http.Dir(root))
	index := filepath.Join(root, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clean the URL path (always forward slashes) so "../" can't probe the
		// container filesystem, then map it onto the OS path.
		clean := path.Clean("/" + r.URL.Path)
		full := filepath.Join(root, filepath.FromSlash(clean))

		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			if strings.HasPrefix(clean, "/assets/") || strings.HasPrefix(clean, "/api/") {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, index)
			return
		}

		switch {
		case strings.HasPrefix(clean, "/assets/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(clean, ".html"), clean == "/sw.js", clean == "/registerSW.js",
			strings.HasPrefix(clean, "/workbox-"), strings.HasSuffix(clean, ".webmanifest"):
			w.Header().Set("Cache-Control", "no-cache")
		default:
			w.Header().Set("Cache-Control", "public, max-age=86400")
		}
		fs.ServeHTTP(w, r)
	})
}
