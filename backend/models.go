package main

import "time"

type User struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type Task struct {
	ID            int        `json:"id"`
	UserID        int        `json:"user_id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	Status        string     `json:"status"`   // e.g. "pending", "completed"
	Priority      string     `json:"priority"` // e.g. "low", "medium", "high"
	DueDate       *time.Time `json:"due_date"`
	AttachmentURL string     `json:"attachment_url"`
	Username      string     `json:"username,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

