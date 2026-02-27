"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Clock,
  CheckSquare,
  Users,
  Copy,
  LogOut,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { createTodo, localDateTimeInputToIso } from "@/lib/todo-client";

const navItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/my-todos", label: "My Todos", icon: CheckSquare },
  { href: "/shared-with-me", label: "Shared with Me", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [sharedWithUserId, setSharedWithUserId] = useState("");
  const [shouldSetDateTime, setShouldSetDateTime] = useState(true);
  const [dueAtInput, setDueAtInput] = useState("");
  const [startMeetingBeforeMin, setStartMeetingBeforeMin] = useState(0);

  const getNowDateTimeLocal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const resetCreateForm = () => {
    setText("");
    setDescription("");
    setSharedWithUserId("");
    setShouldSetDateTime(true);
    setDueAtInput(getNowDateTimeLocal());
    setStartMeetingBeforeMin(0);
    setCreateError(null);
  };

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setUserId(data.userId ?? null);
      } catch {}
    };

    loadAuth();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCopyUserId = async () => {
    if (!userId) return;

    try {
      await navigator.clipboard.writeText(userId);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1200);
    } catch {}
  };

  const handleNewTodo = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    resetCreateForm();
  };

  useEffect(() => {
    if (!isCreateOpen) {
      return;
    }

    const dismissDialog = () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setIsCreateOpen(false);
      setText("");
      setDescription("");
      setSharedWithUserId("");
      setShouldSetDateTime(true);
      setDueAtInput(now.toISOString().slice(0, 16));
      setStartMeetingBeforeMin(0);
      setCreateError(null);
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissDialog();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isCreateOpen]);

  const minDateTime = getNowDateTimeLocal();
  const isSharedTodo = sharedWithUserId.trim().length > 0;

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    const selectedDueAt = shouldSetDateTime
      ? localDateTimeInputToIso(dueAtInput)
      : null;

    if (sharedWithUserId.trim() && !selectedDueAt) {
      setCreateError("Due date & time is required for shared todos");
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      await createTodo({
        text: text.trim(),
        description: description.trim(),
        dueAt: selectedDueAt,
        startMeetingBeforeMin: shouldSetDateTime ? startMeetingBeforeMin : 0,
        sharedWithUserId: sharedWithUserId.trim() || null,
      });

      closeCreateDialog();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("todo:created"));
      }
    } catch (error) {
      setCreateError((error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="p-4 px-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Todo
          </h2>
          <button
            type="button"
            onClick={handleNewTodo}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-1.5" size={14} />
            New Todo
          </button>
        </div>
      </div>

      <nav className="px-3 flex md:block gap-2 md:gap-1 overflow-x-auto md:overflow-visible whitespace-nowrap">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center md:flex shrink-0 md:shrink px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Icon className="mr-2" size={16} />

              {item.label}
            </Link>
          );
        })}
      </nav>

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateDialog();
            }
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create Todo</h2>
              <button
                type="button"
                onClick={closeCreateDialog}
                className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            {createError ? (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">
                {createError}
              </p>
            ) : null}

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <input
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Todo title"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent resize-none"
              />

              <input
                type="text"
                value={sharedWithUserId}
                onChange={(event) => {
                  const nextSharedWithUserId = event.target.value;
                  setSharedWithUserId(nextSharedWithUserId);
                  if (nextSharedWithUserId.trim().length > 0) {
                    setShouldSetDateTime(true);
                  }
                }}
                placeholder="Share with user UUID (optional)"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />

              <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
                <span>Set date & time</span>
                <button
                  type="button"
                  disabled={isSharedTodo}
                  onClick={() => setShouldSetDateTime((current) => !current)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
                    shouldSetDateTime
                      ? "bg-blue-600"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      shouldSetDateTime ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {shouldSetDateTime ? (
                <>
                  <input
                    type="datetime-local"
                    min={minDateTime}
                    value={dueAtInput}
                    onChange={(event) => setDueAtInput(event.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
                  />

                  {isSharedTodo ? (
                    <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300 gap-3">
                      <span>Start meeting before</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          value={startMeetingBeforeMin}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            setStartMeetingBeforeMin(
                              Number.isFinite(parsed) && parsed >= 0
                                ? Math.min(1440, Math.floor(parsed))
                                : 0,
                            );
                          }}
                          className="w-28 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
                        />
                        <span>min</span>
                      </div>
                    </label>
                  ) : null}
                </>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateDialog}
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!text.trim() || isCreating}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="p-4 md:p-5 space-y-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
          {userId ? `Hello, ${userId}` : ""}
        </p>
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCopyUserId}
            disabled={!userId}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Copy size={14} />
            {copyState === "copied" ? "Copied!" : "Copy ID"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
