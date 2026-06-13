package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func loadEnv() {
	// Try loading from current folder first, then parent folder
	paths := []string{".env", "../.env"}
	for _, path := range paths {
		file, err := os.Open(path)
		if err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					val := strings.TrimSpace(parts[1])
					val = strings.Trim(val, `"'`)
					os.Setenv(key, val)
				}
			}
			log.Printf("Loaded environment variables from %s", path)
			return
		}
	}
}

func InitDB() {
	loadEnv()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL != "" {
		// Clean up unsupported parameters that lib/pq does not support
		u, err := url.Parse(dbURL)
		if err == nil {
			q := u.Query()
			q.Del("schema")           // Prisma-style param, not valid in lib/pq
			q.Del("channel_binding")  // NeonDB param, not supported by lib/pq
			u.RawQuery = q.Encode()
			dbURL = u.String()
		}

		// Only force sslmode=disable for local connections; cloud DBs (e.g. NeonDB) require SSL
		isLocal := strings.Contains(dbURL, "localhost") || strings.Contains(dbURL, "127.0.0.1")
		if !strings.Contains(dbURL, "sslmode=") && isLocal {
			if strings.Contains(dbURL, "?") {
				dbURL += "&sslmode=disable"
			} else {
				dbURL += "?sslmode=disable"
			}
		}
	} else {
		host := os.Getenv("DB_HOST")
		if host == "" {
			host = "localhost"
		}
		port := os.Getenv("DB_PORT")
		if port == "" {
			port = "5432"
		}
		user := os.Getenv("DB_USER")
		if user == "" {
			user = "postgres"
		}
		password := os.Getenv("DB_PASSWORD")
		if password == "" {
			password = ""
		}
		dbname := os.Getenv("DB_NAME")
		if dbname == "" {
			dbname = "rival_todo"
		}

		dbURL = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			host, port, user, password, dbname)
	}

	var err error

	// createDatabaseIfNotExists only makes sense for local Postgres where we have
	// superuser access. Skip it for cloud providers like NeonDB which manage their
	// own databases and don't expose the 'postgres' superuser database.
	isLocal := strings.Contains(dbURL, "localhost") || strings.Contains(dbURL, "127.0.0.1")
	if isLocal {
		createDatabaseIfNotExists(dbURL)
	}

	DB, err = sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Error opening database connection: %v", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatalf("Error pinging database: %v", err)
	}

	log.Println("Successfully connected to the database!")

	// Create tables if they do not exist
	createTables()
}

func createDatabaseIfNotExists(dbURL string) {
	defaultDBName := os.Getenv("DB_NAME")
	if defaultDBName == "" {
		defaultDBName = "rival_todo"
	}

	postgresURL := dbURL
	// Replace the target database name with 'postgres' to connect to default database
	if strings.Contains(postgresURL, "/"+defaultDBName) {
		postgresURL = strings.Replace(postgresURL, "/"+defaultDBName, "/postgres", 1)
	}

	tempDB, err := sql.Open("postgres", postgresURL)
	if err != nil {
		log.Printf("Could not open connection to default database to verify target DB: %v", err)
		return
	}
	defer tempDB.Close()

	var exists bool
	query := fmt.Sprintf("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '%s')", defaultDBName)
	err = tempDB.QueryRow(query).Scan(&exists)
	if err != nil {
		log.Printf("Could not query pg_database table: %v", err)
		return
	}

	if !exists {
		_, err = tempDB.Exec(fmt.Sprintf("CREATE DATABASE %s", defaultDBName))
		if err != nil {
			log.Printf("Warning: Failed to create database automatically: %v. You may need to create it manually.", err)
		} else {
			log.Printf("Successfully created database %s automatically!", defaultDBName)
		}
	}
}

func createTables() {
	userTableQuery := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		username VARCHAR(100) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		role VARCHAR(50) DEFAULT 'user',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`

	taskTableQuery := `
	CREATE TABLE IF NOT EXISTS tasks (
		id SERIAL PRIMARY KEY,
		user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
		title VARCHAR(255) NOT NULL,
		description TEXT,
		status VARCHAR(50) DEFAULT 'pending',
		priority VARCHAR(50) DEFAULT 'medium',
		due_date TIMESTAMP,
		attachment_url TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`

	_, err := DB.Exec(userTableQuery)
	if err != nil {
		log.Fatalf("Error creating users table: %v", err)
	}

	_, err = DB.Exec(taskTableQuery)
	if err != nil {
		log.Fatalf("Error creating tasks table: %v", err)
	}

	// Dynamic Alter Table migrations for existing local setups
	_, _ = DB.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';")
	_, _ = DB.Exec("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_url TEXT;")

	log.Println("Database tables initialized successfully.")

	// Seed data if empty
	seedData()
}

func seedData() {
	log.Println("Checking database for seed users...")

	// Seed testuser if not exists
	var testuserExists bool
	err := DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = 'testuser')").Scan(&testuserExists)
	var userID int
	if err == nil && !testuserExists {
		hashedPassword, err := HashPassword("password123")
		if err != nil {
			log.Printf("Failed to hash seed password: %v", err)
			return
		}
		err = DB.QueryRow("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id", "testuser", hashedPassword, "user").Scan(&userID)
		if err != nil {
			log.Printf("Failed to insert seed user: %v", err)
		} else {
			log.Println("testuser seeded successfully!")
			// Insert sample tasks for testuser
			tasks := []struct {
				title       string
				description string
				status      string
				priority    string
			}{
				{"Build full-stack todo application", "Implement REST Go backend and Next.js frontend with local Postgres", "completed", "high"},
				{"Connect to local database", "Ensure postgresql environment variables are configured correctly", "completed", "high"},
				{"Add dark mode", "Enable dark/light theme toggling with tailwind base colors", "pending", "medium"},
				{"Write unit tests", "Create test files to verify authentication logic and handler endpoints", "pending", "medium"},
			}
			for _, t := range tasks {
				_, err := DB.Exec("INSERT INTO tasks (user_id, title, description, status, priority) VALUES ($1, $2, $3, $4, $5)",
					userID, t.title, t.description, t.status, t.priority)
				if err != nil {
					log.Printf("Failed to insert seed task %q: %v", t.title, err)
				}
			}
		}
	}

	// Seed admin if not exists
	var adminExists bool
	err = DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = 'admin')").Scan(&adminExists)
	if err == nil && !adminExists {
		hashedAdminPassword, err := HashPassword("admin123")
		if err == nil {
			_, err = DB.Exec("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)", "admin", hashedPasswordAdminOrCreate(hashedAdminPassword), "admin")
			if err != nil {
				log.Printf("Failed to insert seed admin user: %v", err)
			} else {
				log.Println("admin seeded successfully!")
			}
		}
	}

	log.Println("Resilient seeding check completed.")
}

func hashedPasswordAdminOrCreate(hash string) string {
	return hash
}
