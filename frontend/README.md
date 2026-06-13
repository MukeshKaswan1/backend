# Tickora — Frontend

> Next.js 14 web application for the Tickora task management platform.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + custom CSS variables |
| Icons | Lucide React |
| Validation | Zod |
| HTTP | Native `fetch` API |

---

## Project Structure

```
frontend/
├── src/
│   └── app/
│       ├── layout.tsx          # Root layout, metadata, font setup
│       ├── page.tsx            # Main dashboard (task board + admin view)
│       ├── login/
│       │   └── page.tsx        # Login page
│       └── signup/
│           └── page.tsx        # Sign-up page
├── public/                     # Static assets
├── .env                        # Local environment variables
├── tailwind.config.ts          # Tailwind theme (design tokens)
├── next.config.mjs             # Next.js configuration
└── package.json
```

---

## Pages & Routes

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login form | Public |
| `/signup` | Registration form | Public |
| `/` | Task dashboard | Authenticated |

Unauthenticated users are automatically redirected to `/login`.

---

## Features

### For Users (`role: user`)
- **Task Board** — View, create, edit, and delete your own tasks
- **Status Management** — Toggle tasks between `pending`, `in_progress`, and `completed`
- **Filtering & Search** — Filter by status; search by title
- **Sorting** — Sort by due date, priority, or creation date (asc/desc)
- **Pagination** — Fixed bottom-right paginator, 5 tasks per page
- **File Attachments** — Upload images or documents (up to 10 MB); preview images inline, download docs
- **Due Date Picker** — Cannot select dates in the past; validation shown inline
- **Dark Mode** — Persisted via `localStorage`

### For Admins (`role: admin`)
- **System Metrics Tab** — View total users, total tasks, pending/completed counts
- **Per-User Stats** — Table showing each user's task breakdown
- **All Users' Tasks** — Task board shows tasks from all users with owner username
- **Update / Delete Any Task** — Full edit access across all users
- ❌ Cannot create tasks (admin is an observer, not a task owner)

---

## Authentication Flow

1. User submits credentials on `/login` or `/signup`.
2. Backend returns `{ token, username, role }`.
3. Frontend stores these in `localStorage` under keys `token`, `username`, and `role`.
4. Every API request includes the header `Authorization: Bearer <token>`.
5. On logout, `localStorage` is cleared and the user is redirected to `/login`.

---

## Environment Variables

Create a `frontend/.env` file:

```env
# URL of the Go backend API
NEXT_PUBLIC_API_URL=http://localhost:8080
```

For production (Vercel), set this to your Railway backend URL:

```env
NEXT_PUBLIC_API_URL=https://tickora-backend.up.railway.app
```

> All `NEXT_PUBLIC_` variables are inlined at build time and exposed to the browser.

---

## Running Locally

```bash
# From the project root
cd frontend

# Install dependencies
yarn install
# or: npm install

# Start the development server (hot-reload enabled)
yarn dev
# or: npm run dev

# → App runs on http://localhost:3000
```

---

## Building for Production

```bash
cd frontend
yarn build    # Creates an optimised production build in .next/
yarn start    # Starts the production server
```

---

## API Integration

The frontend communicates with the backend via `fetch`. The base URL is resolved from `NEXT_PUBLIC_API_URL` with a fallback to `http://localhost:8080`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
```

Key endpoints used:

| Action | Endpoint |
|--------|----------|
| Login | `POST /login` |
| Sign up | `POST /signup` |
| List tasks | `GET /tasks?page=&status=&search=&sort_by=&order=` |
| Create task | `POST /tasks` |
| Update task | `PATCH /tasks/{id}` |
| Delete task | `DELETE /tasks/{id}` |
| Upload file | `POST /upload` (multipart/form-data) |
| Admin metrics | `GET /admin/metrics` |

---

## Design System

The design uses CSS custom properties defined in `tailwind.config.ts` and `globals.css`:

| Token | Description |
|-------|-------------|
| `brand-primary` | Indigo accent colour |
| `txt-primary` | Main text colour |
| `bg-surface` | Card / surface background |
| `glass` | Glassmorphism utility class |

Typography uses the **Inter** font via `next/font/google`.

Dark mode is controlled by toggling the `.dark` class on `<html>` and is persisted in `localStorage`.

---

## Deployment (Vercel)

See the root [deployment guide](../README.md#deployment).

1. Push to GitHub.
2. Import the repo in [vercel.com](https://vercel.com).
3. Set **Root Directory** to `frontend`.
4. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://<your-railway-backend>.up.railway.app
   ```
5. Click **Deploy**.

Vercel auto-detects Next.js and runs `next build` + `next start` automatically.
