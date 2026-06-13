package main

import (
	"testing"
)

func TestHashPasswordAndCompare(t *testing.T) {
	password := "testPassword123"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("Expected no error when hashing password, got %v", err)
	}

	if hash == password {
		t.Fatal("Expected hashed password to be different from original password")
	}

	if !CheckPasswordHash(password, hash) {
		t.Fatal("Expected CheckPasswordHash to return true for matching password and hash")
	}

	if CheckPasswordHash("wrongPassword", hash) {
		t.Fatal("Expected CheckPasswordHash to return false for incorrect password")
	}
}

func TestGenerateAndValidateToken(t *testing.T) {
	userID := 42

	token, err := GenerateToken(userID, "user")
	if err != nil {
		t.Fatalf("Expected no error when generating token, got %v", err)
	}

	if token == "" {
		t.Fatal("Expected token to not be empty")
	}

	validatedID, validatedRole, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("Expected no error when validating token, got %v", err)
	}

	if validatedID != userID {
		t.Fatalf("Expected validated user ID to be %d, got %d", userID, validatedID)
	}

	if validatedRole != "user" {
		t.Fatalf("Expected validated role to be 'user', got %q", validatedRole)
	}
}
