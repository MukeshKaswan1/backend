"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Plus,
  Search,
  LogOut,
  Trash2,
  Edit3,
  CheckCircle,
  Circle,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ListTodo,
  SlidersHorizontal,
  Info,
  Paperclip,
  ExternalLink
} from "lucide-react";

interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  attachment_url?: string;
  username?: string;
  created_at: string;
}

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

const taskSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100, "Title must be 100 characters or less"),
  description: z.string().min(10, "Description must be at least 10 characters").max(500, "Description must be 500 characters or less").optional().or(z.literal("")),
  status: z.enum(["pending", "completed"]),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z.string().nullable().refine(val => {
    if (!val) return true;
    return val >= todayStr;
  }, { message: "Due date cannot be in the past" }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")),
  attachment_url: z.string().optional().nullable()
});

export default function Dashboard() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auth state
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [userRole, setUserRole] = useState("user");

  // Filter & Search & Sort states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const limit = 5; // Change pagination limit to 5 per user's requirements

  // Modals / Form State
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const [formPriority, setFormPriority] = useState("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAttachmentUrl, setFormAttachmentUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Admin Tab & Metrics State
  const [adminTab, setAdminTab] = useState<"tasks" | "metrics">("tasks");
  const [metrics, setMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Theme State
  const [isDark, setIsDark] = useState(false);

  // Load Auth State
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("username");
    if (!storedToken) {
      router.push("/login");
    } else {
      setToken(storedToken);
      setUsername(storedUser || "User");
      setUserRole(localStorage.getItem("role") || "user");
    }

    // Load Dark Mode (default is light for blue-and-white theme, but keep support)
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, [router]);

  // Fetch Tasks
  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status: statusFilter,
        sort_by: sortBy,
        order
      });

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/tasks?${queryParams.toString()}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
          return;
        }
        throw new Error("Failed to load tasks");
      }

      const data = await res.json();
      setTasks(data.tasks || []);
      setTotalCount(data.total_count || 0);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching tasks.");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, statusFilter, sortBy, order]);

  // Handle logout
  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    router.push("/login");
  }, [router]);

  const fetchMetrics = useCallback(async () => {
    if (!token || userRole !== "admin") return;
    setLoadingMetrics(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/admin/metrics`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to load admin metrics:", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [token, userRole]);

  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token, page, search, statusFilter, sortBy, order, fetchTasks]);

  useEffect(() => {
    if (token && adminTab === "metrics") {
      fetchMetrics();
    }
  }, [token, adminTab, fetchMetrics]);

  // Toggle Theme
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Toggle Task Status (Optimistic UI update)
  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";

    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }
    } catch (err) {
      // Rollback on Failure
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      alert("Failed to update task status on the server. Rolling back.");
    }
  };

  // Delete Task (Optimistic UI update)
  const handleDeleteTask = async (taskID: number) => {
    const originalTasks = [...tasks];

    // Optimistic Update
    setTasks(prev => prev.filter(t => t.id !== taskID));
    setTotalCount(prev => prev - 1);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/tasks/${taskID}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error("Failed to delete task");
      }
    } catch (err) {
      // Rollback
      setTasks(originalTasks);
      setTotalCount(originalTasks.length);
      alert("Failed to delete task. Rolling back.");
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setEditingTask(null);
    setFormTitle("");
    setFormDesc("");
    setFormStatus("pending");
    setFormPriority("medium");
    setFormDueDate("");
    setFormAttachmentUrl("");
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDesc(task.description || "");
    setFormStatus(task.status);
    setFormPriority(task.priority);
    setFormDueDate(task.due_date ? task.due_date.substring(0, 10) : "");
    setFormAttachmentUrl(task.attachment_url || "");
    setFormErrors({});
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      title: formTitle,
      description: formDesc,
      status: formStatus,
      priority: formPriority,
      due_date: formDueDate || null,
      attachment_url: formAttachmentUrl || ""
    };

    // Zod Validation
    const validationResult = taskSchema.safeParse(payload);
    if (!validationResult.success) {
      const errorsMap: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        errorsMap[path] = issue.message;
      });
      setFormErrors(errorsMap);
      return;
    }

    setSubmitting(true);
    setFormErrors({});

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const url = editingTask ? `${apiUrl}/tasks/${editingTask.id}` : `${apiUrl}/tasks`;
      const method = editingTask ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Something went wrong");
      }

      setShowModal(false);
      fetchTasks();
    } catch (err: any) {
      setFormErrors({ server: err.message || "Failed to save task." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiUrl}/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error("Failed to upload file");
      }

      const data = await res.json();
      setFormAttachmentUrl(data.url);
    } catch (err: any) {
      alert(err.message || "File upload failed");
    } finally {
      setUploadingFile(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="min-h-screen bg-surface-background flex flex-col transition-colors duration-300">
      {/* Top Header */}
      <header className="bg-surface-paper border-b border-surface-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-brand-primary rounded-xl text-white">
              <ListTodo size={20} />
            </div>
            <span className="font-bold text-xl text-txt-primary tracking-tight">
              Tick<span className="text-brand-primary">ora</span>
            </span>
            {userRole === "admin" && (
              <span className="ml-2 bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Admin View
              </span>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-txt-secondary hover:bg-surface-background transition"
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="h-5 w-px bg-surface-border" />
            <span className="text-sm font-medium text-txt-secondary hidden sm:inline">
              Welcome, <span className="text-txt-primary font-semibold">{username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Tab Switcher */}
        {userRole === "admin" && (
          <div className="flex space-x-1 p-1 bg-surface-paper border border-surface-border rounded-xl max-w-sm mb-8">
            <button
              onClick={() => setAdminTab("tasks")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                adminTab === "tasks"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              Task Board
            </button>
            <button
              onClick={() => setAdminTab("metrics")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                adminTab === "metrics"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              System Metrics
            </button>
          </div>
        )}

        {userRole === "admin" && adminTab === "metrics" ? (
          /* Metrics Dashboard */
          <div>
            {loadingMetrics ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-txt-secondary animate-pulse">Loading system metrics...</p>
              </div>
            ) : metrics ? (
              <div className="space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Total Users */}
                  <div className="bg-surface-paper rounded-2xl border border-surface-border p-6 shadow-sm flex flex-col justify-between hover:border-brand-primary transition">
                    <div>
                      <p className="text-xs font-bold text-txt-secondary uppercase tracking-wider mb-2">Total Users</p>
                      <h3 className="text-3xl font-extrabold text-txt-primary">{metrics.total_users}</h3>
                    </div>
                    <div className="mt-4 text-xs text-brand-primary font-semibold">Active registered accounts</div>
                  </div>

                  {/* Total Tasks */}
                  <div className="bg-surface-paper rounded-2xl border border-surface-border p-6 shadow-sm flex flex-col justify-between hover:border-brand-primary transition">
                    <div>
                      <p className="text-xs font-bold text-txt-secondary uppercase tracking-wider mb-2">Total Tasks</p>
                      <h3 className="text-3xl font-extrabold text-txt-primary">{metrics.total_tasks}</h3>
                    </div>
                    <div className="mt-4 text-xs text-txt-secondary font-semibold">All users tasks combined</div>
                  </div>

                  {/* Pending Tasks */}
                  <div className="bg-surface-paper rounded-2xl border border-surface-border p-6 shadow-sm flex flex-col justify-between hover:border-amber-500 transition">
                    <div>
                      <p className="text-xs font-bold text-txt-secondary uppercase tracking-wider mb-2">Pending Tasks</p>
                      <h3 className="text-3xl font-extrabold text-amber-600 dark:text-amber-500">{metrics.pending_tasks}</h3>
                    </div>
                    <div className="mt-4 text-xs text-amber-600 dark:text-amber-400 font-semibold">Awaiting completion</div>
                  </div>

                  {/* Completed Tasks */}
                  <div className="bg-surface-paper rounded-2xl border border-surface-border p-6 shadow-sm flex flex-col justify-between hover:border-green-500 transition">
                    <div>
                      <p className="text-xs font-bold text-txt-secondary uppercase tracking-wider mb-2">Completed Tasks</p>
                      <h3 className="text-3xl font-extrabold text-green-600 dark:text-green-500">{metrics.completed_tasks}</h3>
                    </div>
                    <div className="mt-4 text-xs text-green-655 dark:text-green-400 font-semibold">
                      {metrics.total_tasks > 0 
                        ? `${Math.round((metrics.completed_tasks / metrics.total_tasks) * 100)}% completion rate`
                        : "0% completion rate"
                      }
                    </div>
                  </div>
                </div>

                {/* Users Table */}
                <div className="bg-surface-paper rounded-2xl border border-surface-border shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-surface-border">
                    <h3 className="text-lg font-bold text-txt-primary">User Performance Metrics</h3>
                    <p className="text-xs text-txt-secondary mt-1">Overview of task delegation and task completion stats per user</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-background border-b border-surface-border text-xs font-bold text-txt-secondary uppercase tracking-wider">
                          <th className="p-4 px-6">Username</th>
                          <th className="p-4 px-6">Role</th>
                          <th className="p-4 px-6">Registered</th>
                          <th className="p-4 px-6">Tasks Stats</th>
                          <th className="p-4 px-6">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border text-sm">
                        {metrics.users?.map((u: any) => {
                          const pct = u.total_tasks > 0 ? Math.round((u.completed_tasks / u.total_tasks) * 100) : 0;
                          return (
                            <tr key={u.id} className="hover:bg-surface-background/40 transition">
                              <td className="p-4 px-6 font-semibold text-txt-primary flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                  {u.username.substring(0, 2)}
                                </div>
                                <span className="truncate">{u.username}</span>
                              </td>
                              <td className="p-4 px-6">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                                  u.role === "admin" 
                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400" 
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="p-4 px-6 text-txt-secondary">
                                {new Date(u.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                              </td>
                              <td className="p-4 px-6 text-txt-secondary">
                                <div className="space-y-0.5 text-xs">
                                  <div>Total: <span className="font-semibold text-txt-primary">{u.total_tasks}</span></div>
                                  <div>Pending: <span className="font-semibold text-amber-600 dark:text-amber-500">{u.pending_tasks}</span></div>
                                  <div>Completed: <span className="font-semibold text-green-600 dark:text-green-500">{u.completed_tasks}</span></div>
                                </div>
                              </td>
                              <td className="p-4 px-6">
                                <div className="flex items-center space-x-3 min-w-[120px]">
                                  <div className="flex-1 bg-surface-background rounded-full h-2 overflow-hidden border border-surface-border">
                                    <div 
                                      className="bg-brand-primary h-full rounded-full transition-all duration-300"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-txt-primary">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-surface-paper border border-surface-border rounded-2xl text-txt-secondary">
                Failed to load metrics data.
              </div>
            )}
          </div>
        ) : (
          /* Task Board View */
          <div>
            {/* Controls Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-secondary" size={16} />
                <input
                  type="text"
                  placeholder="Search tasks by title..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-border bg-surface-paper text-sm text-txt-primary placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary transition shadow-sm"
                />
              </div>

              {/* Action Buttons / Selects */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Status Selector */}
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-paper text-sm text-txt-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary transition shadow-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>

                {/* Sort Selector */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-paper text-sm text-txt-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary transition shadow-sm"
                >
                  <option value="created_at">Created Date</option>
                  <option value="due_date">Due Date</option>
                  <option value="priority">Priority</option>
                </select>

                {/* Direction Toggle */}
                <button
                  onClick={() => setOrder(prev => prev === "asc" ? "desc" : "asc")}
                  className="p-2.5 rounded-xl border border-surface-border bg-surface-paper text-txt-secondary hover:bg-surface-background transition shadow-sm"
                  title="Toggle Sort Order"
                >
                  <SlidersHorizontal size={16} className={order === "asc" ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>

                {/* Add Task Trigger */}
                {userRole !== "admin" && (
                  <button
                    onClick={openCreateModal}
                    className="flex items-center space-x-1.5 px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold shadow-md shadow-blue-100 dark:shadow-none hover:shadow-lg transition duration-200"
                  >
                    <Plus size={16} />
                    <span>Add Task</span>
                  </button>
                )}
              </div>
            </div>

            {/* Task View */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-txt-secondary">Loading your tasks list...</p>
              </div>
            ) : error ? (
              <div className="bg-surface-paper rounded-2xl border border-surface-border p-8 text-center max-w-lg mx-auto shadow-md my-12">
                <AlertTriangle className="mx-auto mb-3 text-red-500" size={36} />
                <h3 className="font-bold text-lg text-txt-primary mb-1">Failed to load tasks</h3>
                <p className="text-sm text-txt-secondary mb-6">{error}</p>
                <button
                  onClick={fetchTasks}
                  className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold transition"
                >
                  Try Again
                </button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-surface-paper rounded-2xl border border-surface-border p-12 text-center max-w-md mx-auto shadow-sm my-12">
                <div className="w-12 h-12 bg-surface-background rounded-full flex items-center justify-center mx-auto mb-4 text-txt-secondary">
                  <Info size={24} />
                </div>
                <h3 className="font-bold text-lg text-txt-primary mb-1">No Tasks Found</h3>
                <p className="text-sm text-txt-secondary mb-6">
                  Create a task using the &quot;Add Task&quot; button, or try adjusting your filter query.
                </p>
                <button
                  onClick={openCreateModal}
                  className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold transition"
                >
                  Create Your First Task
                </button>
              </div>
            ) : (
              <div>
                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-surface-paper rounded-2xl border border-surface-border p-5 flex flex-col justify-between hover:shadow-lg transition-all duration-200 group"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${task.priority === "high"
                            ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                            : task.priority === "medium"
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                              : "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400"
                            }`}>
                            {task.priority}
                          </span>

                          <button
                            onClick={() => toggleTaskStatus(task)}
                            className="text-txt-secondary hover:text-brand-primary transition"
                            title={task.status === "completed" ? "Mark incomplete" : "Mark complete"}
                          >
                            {task.status === "completed" ? (
                              <CheckCircle className="text-green-500 fill-green-50 dark:fill-none" size={20} />
                            ) : (
                              <Circle size={20} />
                            )}
                          </button>
                        </div>

                        {/* Content */}
                        {userRole === "admin" && task.username && (
                          <div className="text-xs text-brand-primary font-semibold mb-2 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-1 rounded-lg inline-block">
                            Owner: {task.username}
                          </div>
                        )}
                        <h3 className={`font-semibold text-lg text-txt-primary leading-tight mb-2 group-hover:text-brand-primary transition ${task.status === "completed" ? "line-through text-slate-400 dark:text-slate-550" : ""
                          }`}>
                          {task.title}
                        </h3>
                        <p className={`text-sm text-txt-secondary mb-4 line-clamp-3 ${task.status === "completed" ? "line-through text-slate-400 dark:text-slate-650" : ""
                          }`}>
                          {task.description || "No description provided."}
                        </p>

                        {task.attachment_url && (
                          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                            {/\.(jpeg|jpg|gif|png|webp|svg)$/i.test(task.attachment_url) ? (
                              <div className="relative rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50">
                                <img
                                  src={task.attachment_url}
                                  alt="Attachment preview"
                                  className="max-h-24 w-full object-cover"
                                />
                                <a
                                  href={task.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="absolute bottom-2 right-2 bg-white/90 dark:bg-slate-900/90 p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:text-brand-primary shadow-sm transition"
                                  title="View full image"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 text-xs">
                                <div className="flex items-center space-x-2 text-txt-secondary min-w-0">
                                  <Paperclip size={14} className="shrink-0 text-brand-primary" />
                                  <span className="truncate">
                                    {task.attachment_url.substring(task.attachment_url.lastIndexOf("/") + 1)}
                                  </span>
                                </div>
                                <a
                                  href={task.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 text-slate-500 hover:text-brand-primary transition"
                                  title="Download/Open"
                                >
                                  <ExternalLink size={14} />
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="pt-4 border-t border-surface-border flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-xs text-txt-secondary">
                          <Calendar size={14} />
                          <span>
                            {task.due_date
                              ? new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                              : "No due date"}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openEditModal(task)}
                            className="p-1.5 rounded-lg text-txt-secondary hover:text-brand-primary hover:bg-surface-background transition"
                            title="Edit Task"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 rounded-lg text-txt-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                            title="Delete Task"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="fixed bottom-6 right-6 z-30 flex items-center space-x-3 bg-surface-paper/90 dark:bg-slate-950/90 border border-surface-border p-2.5 px-4 rounded-2xl shadow-xl backdrop-blur-md transition-all duration-300">
                    <button
                      onClick={() => setPage(p => Math.max(p - 1, 1))}
                      disabled={page === 1}
                      className="p-2 rounded-xl border border-surface-border disabled:opacity-50 hover:bg-surface-background transition"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-txt-secondary tracking-wide uppercase select-none">
                      Page {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                      disabled={page === totalPages}
                      className="p-2 rounded-xl border border-surface-border disabled:opacity-50 hover:bg-surface-background transition"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-paper border border-surface-border rounded-2xl max-w-lg w-full p-6 shadow-2xl transition-all">
            <h2 className="text-lg font-bold text-txt-primary mb-5">
              {editingTask ? "Edit Task" : "Create New Task"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formErrors.server && (
                <div className="text-sm bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-900/50 text-red-650 dark:text-red-400 p-3 rounded-xl">
                  {formErrors.server}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="Task title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-background text-sm text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand-primary transition"
                />
                {formErrors.title && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.title}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Write details of your task..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-background text-sm text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand-primary transition"
                />
                {formErrors.description && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-background text-sm text-txt-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary transition"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-background text-sm text-txt-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary transition"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border bg-surface-background text-sm text-txt-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary transition"
                />
                {formErrors.due_date && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.due_date}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                  Attachment (Optional)
                </label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-slate-350"
                />
                {uploadingFile && <p className="text-xs text-brand-primary mt-1 animate-pulse font-medium">Uploading file...</p>}
                
                {formAttachmentUrl && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-205 dark:border-slate-800 flex items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center space-x-3 min-w-0">
                      {/\.(jpeg|jpg|gif|png|webp|svg)$/i.test(formAttachmentUrl) ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shrink-0">
                          <img
                            src={formAttachmentUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Paperclip size={20} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-txt-primary truncate">
                          {formAttachmentUrl.substring(formAttachmentUrl.lastIndexOf("/") + 1)}
                        </p>
                        <a
                          href={formAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-brand-primary hover:underline flex items-center space-x-0.5 mt-0.5"
                        >
                          <span>View Attachment</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormAttachmentUrl("")}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Remove Attachment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-5 border-t border-surface-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 border border-surface-border rounded-xl text-sm font-semibold text-txt-secondary hover:bg-surface-background transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold disabled:opacity-50 transition"
                >
                  {submitting ? "Saving..." : "Save Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
