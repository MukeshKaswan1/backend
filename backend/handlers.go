package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type contextKey string

const (
	userContextKey contextKey = "userID"
	roleContextKey contextKey = "role"
)

// ErrorResponse defines standard error JSON format
type ErrorResponse struct {
	Error string `json:"error"`
}

// TokenResponse defines response with token, username, and role
type TokenResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// Helper to write JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON: %v", err)
	}
}


// Helper to write JSON error
func writeError(w http.ResponseWriter, status int, errMsg string) {
	writeJSON(w, status, ErrorResponse{Error: errMsg})
}

// AuthMiddleware protects routes by validating JWT from the Authorization header
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Support preflight OPTIONS request
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "Authorization header required")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			writeError(w, http.StatusUnauthorized, "Invalid Authorization format. Expected 'Bearer <token>'")
			return
		}

		userID, role, err := ValidateToken(parts[1])
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, userID)
		ctx = context.WithValue(ctx, roleContextKey, role)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// getUserID retrieves the user ID from context
func getUserID(r *http.Request) (int, error) {
	userID, ok := r.Context().Value(userContextKey).(int)
	if !ok {
		return 0, fmt.Errorf("user not authenticated")
	}
	return userID, nil
}

// getUserRole retrieves the user role from context
func getUserRole(r *http.Request) (string, error) {
	role, ok := r.Context().Value(roleContextKey).(string)
	if !ok {
		return "", fmt.Errorf("user not authenticated")
	}
	return role, nil
}


// SignupHandler handles new user registration
func SignupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		AdminKey  string `json:"adminKey"`
		AdminKey2 string `json:"admin_key"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON input")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)

	if req.Username == "" || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Username is required and password must be at least 6 characters long")
		return
	}

	// Check if user already exists
	var existingID int
	err := DB.QueryRow("SELECT id FROM users WHERE username = $1", req.Username).Scan(&existingID)
	if err == nil {
		writeError(w, http.StatusConflict, "Username already exists")
		return
	} else if err != sql.ErrNoRows {
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	role := "user"

	var userID int
	err = DB.QueryRow("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id", req.Username, hashedPassword, role).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	token, err := GenerateToken(userID, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, TokenResponse{Token: token, Username: req.Username, Role: role})
}

// LoginHandler handles user signin
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON input")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)

	var userID int
	var passwordHash string
	var role string
	err := DB.QueryRow("SELECT id, password_hash, role FROM users WHERE username = $1", req.Username).Scan(&userID, &passwordHash, &role)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusUnauthorized, "Invalid username or password")
		} else {
			writeError(w, http.StatusInternalServerError, "Database error")
		}
		return
	}

	if !CheckPasswordHash(req.Password, passwordHash) {
		writeError(w, http.StatusUnauthorized, "Invalid username or password")
		return
	}

	token, err := GenerateToken(userID, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, TokenResponse{Token: token, Username: req.Username, Role: role})
}

// CreateTaskHandler creates a new task for the authenticated user
func CreateTaskHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, err := getUserID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	role, _ := getUserRole(r)
	if role == "admin" {
		writeError(w, http.StatusForbidden, "Admins are not allowed to create tasks")
		return
	}

	var req struct {
		Title         string `json:"title"`
		Description   string `json:"description"`
		Status        string `json:"status"`
		Priority      string `json:"priority"`
		DueDate       string `json:"due_date"` // expected format: RFC3339 or "YYYY-MM-DD"
		AttachmentURL string `json:"attachment_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON input")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "Title is required")
		return
	}

	if req.Status == "" {
		req.Status = "pending"
	}
	if req.Priority == "" {
		req.Priority = "medium"
	}

	var dueDate *time.Time
	if req.DueDate != "" {
		parsedTime, err := time.Parse(time.RFC3339, req.DueDate)
		if err != nil {
			// Try YYYY-MM-DD
			parsedTime, err = time.Parse("2006-01-02", req.DueDate)
			if err != nil {
				writeError(w, http.StatusBadRequest, "Invalid due_date format. Use ISO8601/RFC3339 or YYYY-MM-DD")
				return
			}
		}
		dueDate = &parsedTime
	}

	var task Task
	err = DB.QueryRow(
		`INSERT INTO tasks (user_id, title, description, status, priority, due_date, attachment_url) 
		 VALUES ($1, $2, $3, $4, $5, $6, $7) 
		 RETURNING id, user_id, title, description, status, priority, due_date, attachment_url, created_at, updated_at`,
		userID, req.Title, req.Description, req.Status, req.Priority, dueDate, req.AttachmentURL,
	).Scan(&task.ID, &task.UserID, &task.Title, &task.Description, &task.Status, &task.Priority, &task.DueDate, &task.AttachmentURL, &task.CreatedAt, &task.UpdatedAt)

	if err != nil {
		log.Printf("Error inserting task: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create task")
		return
	}

	writeJSON(w, http.StatusCreated, task)
}

// TasksHandler handles listing/fetching tasks or routing tasks requests by path
func TasksHandler(w http.ResponseWriter, r *http.Request) {
	// Root endpoint: GET /tasks or POST /tasks
	if r.URL.Path == "/tasks" || r.URL.Path == "/tasks/" {
		if r.Method == http.MethodGet {
			ListTasksHandler(w, r)
			return
		} else if r.Method == http.MethodPost {
			CreateTaskHandler(w, r)
			return
		}
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Path parsing: /tasks/:id
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) == 2 && parts[0] == "tasks" {
		taskID, err := strconv.Atoi(parts[1])
		if err != nil {
			writeError(w, http.StatusBadRequest, "Invalid task ID")
			return
		}

		switch r.Method {
		case http.MethodGet:
			GetTaskHandler(w, r, taskID)
		case http.MethodPatch:
			UpdateTaskHandler(w, r, taskID)
		case http.MethodDelete:
			DeleteTaskHandler(w, r, taskID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	writeError(w, http.StatusNotFound, "Not found")
}

// ListTasksHandler fetches a paginated list of tasks with filters, search, and sorting
func ListTasksHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	role, _ := getUserRole(r)

	// Read Query Params
	statusFilter := r.URL.Query().Get("status") // optional status filter
	searchQuery := r.URL.Query().Get("search")  // search in title
	sortBy := r.URL.Query().Get("sort_by")      // "due_date", "priority", "created_at" (default)
	order := r.URL.Query().Get("order")          // "asc", "desc" (default)
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page := 1
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}

	limit := 5
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	offset := (page - 1) * limit

	// Build SQL query dynamically
	var query string
	var countQuery string
	var args []interface{}
	var paramIndex int

	if role == "admin" {
		query = `SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, COALESCE(t.attachment_url, ''), u.username, t.created_at, t.updated_at 
		         FROM tasks t JOIN users u ON t.user_id = u.id WHERE 1=1`
		countQuery = "SELECT COUNT(*) FROM tasks t WHERE 1=1"
		args = []interface{}{}
		paramIndex = 1
	} else {
		query = `SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, COALESCE(t.attachment_url, ''), u.username, t.created_at, t.updated_at 
		         FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.user_id = $1`
		countQuery = "SELECT COUNT(*) FROM tasks t WHERE t.user_id = $1"
		args = []interface{}{userID}
		paramIndex = 2
	}

	if statusFilter != "" {
		query += fmt.Sprintf(" AND t.status = $%d", paramIndex)
		countQuery += fmt.Sprintf(" AND t.status = $%d", paramIndex)
		args = append(args, statusFilter)
		paramIndex++
	}

	if searchQuery != "" {
		query += fmt.Sprintf(" AND t.title ILIKE $%d", paramIndex)
		countQuery += fmt.Sprintf(" AND t.title ILIKE $%d", paramIndex)
		args = append(args, "%"+searchQuery+"%")
		paramIndex++
	}

	// Sorting
	orderSql := "DESC"
	if strings.ToLower(order) == "asc" {
		orderSql = "ASC"
	}

	sortSql := "t.created_at"
	switch sortBy {
	case "due_date":
		sortSql = "t.due_date"
	case "priority":
		// Custom sort: high -> medium -> low
		sortSql = "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END"
	}

	query += fmt.Sprintf(" ORDER BY %s %s", sortSql, orderSql)

	// Count total records
	var totalCount int
	err = DB.QueryRow(countQuery, args...).Scan(&totalCount)
	if err != nil {
		log.Printf("Error counting tasks: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Add pagination
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", paramIndex, paramIndex+1)
	args = append(args, limit, offset)

	rows, err := DB.Query(query, args...)
	if err != nil {
		log.Printf("Error querying tasks: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	tasks := []Task{}
	for rows.Next() {
		var task Task
		err := rows.Scan(&task.ID, &task.UserID, &task.Title, &task.Description, &task.Status, &task.Priority, &task.DueDate, &task.AttachmentURL, &task.Username, &task.CreatedAt, &task.UpdatedAt)
		if err != nil {
			log.Printf("Error scanning task: %v", err)
			writeError(w, http.StatusInternalServerError, "Database error")
			return
		}
		tasks = append(tasks, task)
	}

	type PaginatedResponse struct {
		Tasks      []Task `json:"tasks"`
		TotalCount int    `json:"total_count"`
		Page       int    `json:"page"`
		Limit      int    `json:"limit"`
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Tasks:      tasks,
		TotalCount: totalCount,
		Page:       page,
		Limit:      limit,
	})
}

// GetTaskHandler fetches a single task by ID
func GetTaskHandler(w http.ResponseWriter, r *http.Request, taskID int) {
	userID, err := getUserID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	role, _ := getUserRole(r)

	var query string
	var args []interface{}
	if role == "admin" {
		query = `SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, COALESCE(t.attachment_url, ''), u.username, t.created_at, t.updated_at 
		         FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.id = $1`
		args = []interface{}{taskID}
	} else {
		query = `SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, COALESCE(t.attachment_url, ''), u.username, t.created_at, t.updated_at 
		         FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.id = $1 AND t.user_id = $2`
		args = []interface{}{taskID, userID}
	}

	var task Task
	err = DB.QueryRow(query, args...).Scan(
		&task.ID, &task.UserID, &task.Title, &task.Description, &task.Status, &task.Priority, &task.DueDate, &task.AttachmentURL, &task.Username, &task.CreatedAt, &task.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Task not found or access denied")
		} else {
			log.Printf("Error scanning task: %v", err)
			writeError(w, http.StatusInternalServerError, "Database error")
		}
		return
	}

	writeJSON(w, http.StatusOK, task)
}

// UpdateTaskHandler updates tasks fields (PATCH)
func UpdateTaskHandler(w http.ResponseWriter, r *http.Request, taskID int) {
	userID, err := getUserID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	role, _ := getUserRole(r)

	// Verify task ownership or admin access
	var existingID int
	var existingUserID int
	var errQuery error
	if role == "admin" {
		errQuery = DB.QueryRow("SELECT id, user_id FROM tasks WHERE id = $1", taskID).Scan(&existingID, &existingUserID)
	} else {
		errQuery = DB.QueryRow("SELECT id, user_id FROM tasks WHERE id = $1 AND user_id = $2", taskID, userID).Scan(&existingID, &existingUserID)
	}

	if errQuery != nil {
		if errQuery == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Task not found or access denied")
		} else {
			writeError(w, http.StatusInternalServerError, "Database error")
		}
		return
	}

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON input")
		return
	}

	// Build update statement dynamically
	query := "UPDATE tasks SET updated_at = NOW()"
	args := []interface{}{}
	paramIndex := 1

	validFields := map[string]bool{
		"title":          true,
		"description":    true,
		"status":         true,
		"priority":       true,
		"due_date":       true,
		"attachment_url": true,
	}

	for field, val := range updates {
		if !validFields[field] {
			continue
		}

		if field == "title" {
			titleStr, ok := val.(string)
			if !ok || strings.TrimSpace(titleStr) == "" {
				writeError(w, http.StatusBadRequest, "Title cannot be empty")
				return
			}
			val = strings.TrimSpace(titleStr)
		}

		if field == "due_date" {
			if val == nil || val == "" {
				val = nil
			} else {
				dueDateStr, ok := val.(string)
				if !ok {
					writeError(w, http.StatusBadRequest, "Invalid due_date format")
					return
				}
				parsedTime, err := time.Parse(time.RFC3339, dueDateStr)
				if err != nil {
					parsedTime, err = time.Parse("2006-01-02", dueDateStr)
					if err != nil {
						writeError(w, http.StatusBadRequest, "Invalid due_date format. Use ISO8601/RFC3339 or YYYY-MM-DD")
						return
					}
				}
				val = parsedTime
			}
		}

		query += fmt.Sprintf(", %s = $%d", field, paramIndex)
		args = append(args, val)
		paramIndex++
	}

	if role == "admin" {
		query += fmt.Sprintf(" WHERE id = $%d RETURNING id, user_id, title, description, status, priority, due_date, COALESCE(attachment_url, ''), created_at, updated_at", paramIndex)
		args = append(args, taskID)
	} else {
		query += fmt.Sprintf(" WHERE id = $%d AND user_id = $%d RETURNING id, user_id, title, description, status, priority, due_date, COALESCE(attachment_url, ''), created_at, updated_at", paramIndex, paramIndex+1)
		args = append(args, taskID, userID)
	}

	var task Task
	err = DB.QueryRow(query, args...).Scan(&task.ID, &task.UserID, &task.Title, &task.Description, &task.Status, &task.Priority, &task.DueDate, &task.AttachmentURL, &task.CreatedAt, &task.UpdatedAt)
	if err != nil {
		log.Printf("Error updating task: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to update task")
		return
	}

	writeJSON(w, http.StatusOK, task)
}

// DeleteTaskHandler deletes a task by ID
func DeleteTaskHandler(w http.ResponseWriter, r *http.Request, taskID int) {
	userID, err := getUserID(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	role, _ := getUserRole(r)

	var result sql.Result
	var errDelete error
	if role == "admin" {
		result, errDelete = DB.Exec("DELETE FROM tasks WHERE id = $1", taskID)
	} else {
		result, errDelete = DB.Exec("DELETE FROM tasks WHERE id = $1 AND user_id = $2", taskID, userID)
	}

	if errDelete != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete task")
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to check delete status")
		return
	}

	if rowsAffected == 0 {
		writeError(w, http.StatusNotFound, "Task not found or access denied")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Task deleted successfully"})
}

// UploadHandler handles file uploads
func UploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Limit to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large (max 10MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to parse file field from form")
		return
	}
	defer file.Close()

	if err := os.MkdirAll("uploads", os.ModePerm); err != nil {
		log.Printf("Error creating uploads dir: %v", err)
		writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	ext := filepath.Ext(header.Filename)
	fileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join("uploads", fileName)

	out, err := os.Create(filePath)
	if err != nil {
		log.Printf("Error creating file on disk: %v", err)
		writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		log.Printf("Error copying file: %v", err)
		writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	url := fmt.Sprintf("http://%s/uploads/%s", r.Host, fileName)
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

type UserMetrics struct {
	ID             int       `json:"id"`
	Username       string    `json:"username"`
	Role           string    `json:"role"`
	CreatedAt      time.Time `json:"created_at"`
	TotalTasks     int       `json:"total_tasks"`
	PendingTasks   int       `json:"pending_tasks"`
	CompletedTasks int       `json:"completed_tasks"`
}

type AdminMetricsResponse struct {
	TotalUsers     int           `json:"total_users"`
	TotalTasks     int           `json:"total_tasks"`
	PendingTasks   int           `json:"pending_tasks"`
	CompletedTasks int           `json:"completed_tasks"`
	Users          []UserMetrics `json:"users"`
}

// AdminMetricsHandler returns application status and list of users with metrics
func AdminMetricsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	role, err := getUserRole(r)
	if err != nil || role != "admin" {
		writeError(w, http.StatusForbidden, "Access denied. Admin role required.")
		return
	}

	var totalUsers int
	err = DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	if err != nil {
		log.Printf("Error counting users: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	var totalTasks int
	err = DB.QueryRow("SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	if err != nil {
		log.Printf("Error counting tasks: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	var pendingTasks int
	err = DB.QueryRow("SELECT COUNT(*) FROM tasks WHERE status = 'pending'").Scan(&pendingTasks)
	if err != nil {
		log.Printf("Error counting pending tasks: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	var completedTasks int
	err = DB.QueryRow("SELECT COUNT(*) FROM tasks WHERE status = 'completed'").Scan(&completedTasks)
	if err != nil {
		log.Printf("Error counting completed tasks: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Fetch users with their task stats
	rows, err := DB.Query(`
		SELECT 
			u.id, 
			u.username, 
			u.role, 
			u.created_at,
			COUNT(t.id) as total_tasks,
			COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
			COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks
		FROM users u
		LEFT JOIN tasks t ON u.id = t.user_id
		GROUP BY u.id, u.username, u.role, u.created_at
		ORDER BY u.username ASC
	`)
	if err != nil {
		log.Printf("Error fetching user stats: %v", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	usersMetrics := []UserMetrics{}
	for rows.Next() {
		var m UserMetrics
		err := rows.Scan(&m.ID, &m.Username, &m.Role, &m.CreatedAt, &m.TotalTasks, &m.PendingTasks, &m.CompletedTasks)
		if err != nil {
			log.Printf("Error scanning user metrics: %v", err)
			writeError(w, http.StatusInternalServerError, "Database error")
			return
		}
		usersMetrics = append(usersMetrics, m)
	}

	writeJSON(w, http.StatusOK, AdminMetricsResponse{
		TotalUsers:     totalUsers,
		TotalTasks:     totalTasks,
		PendingTasks:   pendingTasks,
		CompletedTasks: completedTasks,
		Users:          usersMetrics,
	})
}

