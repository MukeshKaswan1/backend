# Tickora — Backend

> REST API server powering the Tickora task management platform.  
> Built with **Go** (standard library only) and **PostgreSQL**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Go 1.22+ |
| HTTP Router | `net/http` (built-in, no framework) |
| Database | PostgreSQL via `lib/pq` |
| Auth | JWT (`golang-jwt/jwt/v5`) + bcrypt (`golang.org/x/crypto`) |
| CORS | `rs/cors` |

---

## Project Structure

```
backend/
├── main.go        # Entry point — registers routes, starts HTTP server
├── handlers.go    # All HTTP handler functions & middleware
├── auth.go        # JWT generation & validation, password hashing
├── db.go          # DB connection, schema migration, seed data
├── models.go      # Shared struct definitions (Task, User)
├── auth_test.go   # Unit tests for auth logic
├── .env           # Local environment variables (not committed)
└── uploads/       # Locally uploaded files (ephemeral in production)
```

---

## API Reference

All protected routes require an `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/signup` | ✗ | Register a new user (role: `user`) |
| `POST` | `/login` | ✗ | Login and receive a JWT |

**POST `/signup`** — Request body:
```json
{ "username": "alice", "password": "secret123" }
```

**POST `/login`** — Request body:
```json
{ "username": "alice", "password": "secret123" }
```

Both return:
```json
{ "token": "eyJ...", "username": "alice", "role": "user" }
```

---

### Tasks (User)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tasks` | ✅ | List tasks (paginated, filterable) |
| `POST` | `/tasks` | ✅ User only | Create a new task |
| `GET` | `/tasks/{id}` | ✅ | Get a single task |
| `PATCH` | `/tasks/{id}` | ✅ | Update task fields |
| `DELETE` | `/tasks/{id}` | ✅ | Delete a task |

**GET `/tasks`** — Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `status` | `pending` \| `in_progress` \| `completed` | Filter by status |
| `search` | string | Case-insensitive title search |
| `sort_by` | `due_date` \| `priority` \| `created_at` | Sort field |
| `order` | `asc` \| `desc` | Sort direction |
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Results per page (default: `5`, max: `100`) |

**GET `/tasks`** — Paginated response:
```json
{
  "tasks": [...],
  "total_count": 42,
  "page": 1,
  "limit": 5
}
```

**POST `/tasks`** — Request body:
```json
{
  "title": "Design login page",
  "description": "Wireframe and implement",
  "status": "pending",
  "priority": "high",
  "due_date": "2025-12-31",
  "attachment_url": "https://..."
}
```

> `due_date` accepts both `YYYY-MM-DD` and RFC3339 (`2025-12-31T00:00:00Z`).

**PATCH `/tasks/{id}`** — Send only the fields you want to update:
```json
{ "status": "completed" }
```

---

### File Uploads

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload` | ✅ | Upload an image or document (max 10 MB) |
| `GET` | `/uploads/{filename}` | ✗ | Serve an uploaded file |

**POST `/upload`** — `multipart/form-data` with a field named `file`.

Response:
```json
{ "url": "http://localhost:8080/uploads/1234567890.png" }
```

---

### Admin (Role: `admin` only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/admin/metrics` | ✅ Admin | System-wide task stats + per-user breakdown |

**GET `/admin/metrics`** — Response:
```json
{
  "total_users": 5,
  "total_tasks": 42,
  "pending_tasks": 18,
  "completed_tasks": 20,
  "users": [
    {
      "id": 2,
      "username": "alice",
      "role": "user",
      "created_at": "2025-01-01T00:00:00Z",
      "total_tasks": 10,
      "pending_tasks": 4,
      "completed_tasks": 6
    }
  ]
}
```

> Admins can view **all users' tasks** via `GET /tasks`, `PATCH /tasks/{id}`, and `DELETE /tasks/{id}`, but **cannot create tasks**.

---

## Role-Based Access Control

| Action | `user` | `admin` |
|--------|--------|---------|
| Sign up / Log in | ✅ | ✅ |
| Create task | ✅ | ❌ |
| View own tasks | ✅ | — |
| View all users' tasks | ❌ | ✅ |
| Update / Delete own tasks | ✅ | — |
| Update / Delete any task | ❌ | ✅ |
| View admin metrics | ❌ | ✅ |

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) DEFAULT 'user',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks
CREATE TABLE tasks (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  status         VARCHAR(50) DEFAULT 'pending',
  priority       VARCHAR(50) DEFAULT 'medium',
  due_date       TIMESTAMP,
  attachment_url TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> Tables are **auto-migrated** on startup — no migration tool needed.

### Seeded Accounts

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `testuser` | `password123` | user |

---

## Environment Variables

Copy `.env.example` (in the project root) and create `backend/.env`:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Full Postgres connection string | `postgres://user:pw@host/db?sslmode=require` |
| `DB_HOST` | DB host (used if `DATABASE_URL` not set) | `localhost` |
| `DB_PORT` | DB port | `5432` |
| `DB_USER` | DB username | `postgres` |
| `DB_PASSWORD` | DB password | `secret` |
| `DB_NAME` | Database name | `tickora` |
| `JWT_SECRET` | Secret key for signing JWTs | 32+ char random hex |
| `PORT` | HTTP server port | `8080` |

> `DATABASE_URL` takes precedence over individual `DB_*` variables.

---

## Running Locally

```bash
# From the project root
cd backend

# Download Go dependencies
go mod tidy

# Start the server (auto-migrates DB and seeds users)
go run .
# → Server runs on http://localhost:8080

# Run tests
go test -v ./...
```

---

## Building for Production

```bash
cd backend
go build -o server .
./server
```

---

## Deployment (Railway + NeonDB)

See the root [deployment guide](../README.md#deployment) or the full [deployment_guide.md](../.env.example).

**Key env vars to set on Railway:**

```
DATABASE_URL=postgres://user:pw@ep-xxx.neon.tech/neondb?sslmode=require
JWT_SECRET=<your-secret>
PORT=8080
```

> ⚠️ The local `uploads/` folder is **ephemeral** on Railway. Integrate Cloudinary or S3 for persistent file storage in production.
