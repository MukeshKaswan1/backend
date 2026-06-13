# Tickora — Premium Task Management

> A full-stack task management platform with role-based access control, file attachments, and a real-time admin dashboard.

[![Backend](https://img.shields.io/badge/backend-Go-00ADD8?logo=go)](./backend/README.md)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2014-black?logo=next.js)](./frontend/README.md)
[![Database](https://img.shields.io/badge/database-PostgreSQL-336791?logo=postgresql)](https://neon.tech)

---

## Features

- 🔐 **JWT Authentication** — Secure sign-up/login with bcrypt hashed passwords
- 👥 **Role-Based Access Control** — Separate `user` and `admin` roles with scoped permissions
- ✅ **Task Management** — Create, read, update, and delete tasks with status, priority, and due dates
- 📎 **File Attachments** — Upload images and documents per task (up to 10 MB)
- 🔍 **Search, Filter & Sort** — Real-time title search, status filter, multi-field sort
- 📄 **Pagination** — Fixed bottom-right paginator
- 📊 **Admin Dashboard** — System-wide metrics and per-user task breakdown
- 🌙 **Dark Mode** — Persisted dark/light theme toggle
- 🚀 **Zero-migration DB** — Tables auto-created on first backend startup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide React |
| Backend | Go 1.22+, `net/http` (no framework) |
| Database | PostgreSQL (local or [NeonDB](https://neon.tech) for cloud) |
| Auth | JWT + bcrypt |

---

## Monorepo Layout

```
Rival-todo/
├── backend/          # Go REST API → see backend/README.md
├── frontend/         # Next.js app → see frontend/README.md
├── .env.example      # Environment variable template
├── railway.toml      # Railway deployment config (backend)
└── README.md         # This file
```

---

## Quick Start (Local)

### Prerequisites
- **Go** ≥ 1.22
- **Node.js** ≥ 18 + **Yarn** or **npm**
- **PostgreSQL** running locally

### 1. Clone & Configure

```bash
git clone https://github.com/<your-org>/tickora.git
cd tickora
cp .env.example backend/.env
# Edit backend/.env with your local Postgres credentials
```

### 2. Start the Backend

```bash
cd backend
go mod tidy
go run .
# → http://localhost:8080
# Tables are auto-created; admin & testuser are seeded automatically
```

### 3. Start the Frontend

```bash
cd frontend
yarn install
yarn dev
# → http://localhost:3000
```

### Default Accounts

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Admin |
| `testuser` | `password123` | User |

---

## Deployment

The recommended production setup uses:

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [NeonDB](https://neon.tech) | Serverless PostgreSQL | ✅ |
| [Railway](https://railway.app) | Go backend hosting | ✅ 500 hrs/month |
| [Vercel](https://vercel.com) | Next.js frontend hosting | ✅ |

See the full step-by-step guide → **[Deployment Guide](./backend/README.md#deployment-railway--neodnb)**

**Summary:**
1. Create a NeonDB project → copy the `DATABASE_URL`
2. Deploy backend on Railway → set `DATABASE_URL` + `JWT_SECRET` → get backend URL
3. Deploy frontend on Vercel → set `NEXT_PUBLIC_API_URL` to the Railway URL

---

## Documentation

| README | Contents |
|--------|---------|
| [backend/README.md](./backend/README.md) | API reference, RBAC table, DB schema, env vars, Go build |
| [frontend/README.md](./frontend/README.md) | Pages, features, auth flow, design system, Vercel deploy |

---

## Architecture

```
Browser (Vercel)
    │
    │  NEXT_PUBLIC_API_URL
    ▼
Go API Server (Railway · :8080)
    │
    │  DATABASE_URL
    ▼
PostgreSQL (NeonDB / local pgAdmin)
```
