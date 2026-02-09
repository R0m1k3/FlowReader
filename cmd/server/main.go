package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
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
	// Load configuration
	cfg := config.Load()

	// Initialize database connection pool
	ctx := context.Background()
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer pool.Close()

	// Check migrations status (warning only, doesn't block)
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

	// Initialize WS Hub
	hub := ws.NewHub()
	go hub.Run()

	fetchService := service.NewFetchService(feedRepo, articleRepo, hub)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(authService)
	feedHandler := handler.NewFeedHandler(feedService, fetchService, authService)
	articleHandler := handler.NewArticleHandler(articleRepo, feedService, authService, hub)
	wsHandler := handler.NewWSHandler(hub, authService)
	adminHandler := handler.NewAdminHandler(userRepo, authService)

	// Start background feed fetcher
	fetcher := worker.NewFeedFetcher(fetchService, 15*time.Minute, 5)
	fetcher.Start()
	defer fetcher.Stop()

	// Initialize router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Timeout(30 * time.Second))

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
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"message":"FlowReader API v1"}`))
		})

		// Auth routes (public)
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.Post("/logout", authHandler.Logout)
		})

		// User routes
		r.Route("/users", func(r chi.Router) {
			r.Get("/me", authHandler.Me)
		})

		// Feed routes
		r.Route("/feeds", func(r chi.Router) {
			r.Get("/", feedHandler.List)
			r.Post("/", feedHandler.Add)
			r.Post("/refresh", feedHandler.Refresh)
			r.Post("/import/opml", feedHandler.ImportOPML)
			r.Get("/export/opml", feedHandler.ExportOPML)
			r.Get("/{id}", feedHandler.Get)
			r.Patch("/{id}", feedHandler.Update)
			r.Delete("/{id}", feedHandler.Delete)
			r.Get("/{id}/articles", articleHandler.ListByFeed)
			r.Post("/{id}/read-all", articleHandler.MarkAllRead)
		})

		// Article routes
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

		// WebSocket route
		r.Get("/ws", wsHandler.Connect)

		// Admin routes
		r.Route("/admin", func(r chi.Router) {
			r.Use(adminHandler.AdminOnly)
			r.Get("/users", adminHandler.ListUsers)
			r.Delete("/users/{id}", adminHandler.DeleteUser)
		})
	})

	// Serve Static Files (Frontend)
	staticPath := "./web/dist"
	if _, err := os.Stat(staticPath); err == nil {
		fs := http.FileServer(http.Dir(staticPath))
		r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// If the file exists, serve it, otherwise serve index.html (for SPA routing)
			path := staticPath + r.URL.Path
			if _, err := os.Stat(path); os.IsNotExist(err) {
				http.ServeFile(w, r, staticPath+"/index.html")
				return
			}
			fs.ServeHTTP(w, r)
		}))
	}

	// Create server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
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
