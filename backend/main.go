package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/rs/cors"
)

func main() {
	// Initialize database
	InitDB()

	// Create router
	mux := http.NewServeMux()

	// Authentication routes
	mux.HandleFunc("/signup", SignupHandler)
	mux.HandleFunc("/login", LoginHandler)

	// Task routes (protected by AuthMiddleware inside TasksHandler or at endpoint register level)
	// We wrap standard handlers with AuthMiddleware
	mux.HandleFunc("/tasks", AuthMiddleware(TasksHandler))
	mux.HandleFunc("/tasks/", AuthMiddleware(TasksHandler))

	// File Upload routes
	mux.HandleFunc("/upload", AuthMiddleware(UploadHandler))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

	// Admin routes
	mux.HandleFunc("/admin/metrics", AuthMiddleware(AdminMetricsHandler))

	// Get Port from env
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Set up CORS
	// NOTE: rs/cors does NOT support wildcard subdomains (*.vercel.app) when
	// AllowCredentials is true — always use exact origin URLs.
	allowedOrigins := []string{
		"http://localhost:3000",
		"http://localhost:3001",
		"https://tickora-frontend.vercel.app",
	}
	// Allow additional origins via env var (comma-separated) for preview deployments
	if extra := os.Getenv("EXTRA_ORIGINS"); extra != "" {
		for _, o := range strings.Split(extra, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowedOrigins = append(allowedOrigins, o)
			}
		}
	}
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}).Handler(mux)

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, corsHandler); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
