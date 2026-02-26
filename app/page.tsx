"use client";

import { useState, useEffect } from "react";
import { Check, Trash2, Plus, Pencil, Save, X } from "lucide-react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

interface Todo {
  id: string;
  text: string;
  description: string;
  completed: boolean;
  dueAt: string | null;
  createdAt: number;
}

const getNowDateTimeLocal = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const sortTodos = (items: Todo[]) => {
  return [...items].sort((first, second) => {
    if (!first.dueAt && !second.dueAt) {
      return first.createdAt - second.createdAt;
    }
    if (!first.dueAt) {
      return -1;
    }
    if (!second.dueAt) {
      return 1;
    }
    return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime();
  });
};

function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [shouldSetDateTime, setShouldSetDateTime] = useState(true);
  const [dateTimeValue, setDateTimeValue] = useState(getNowDateTimeLocal());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editShouldSetDateTime, setEditShouldSetDateTime] = useState(true);
  const [editDateTime, setEditDateTime] = useState(getNowDateTimeLocal());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedTodos = localStorage.getItem("todos");
    if (savedTodos) {
      try {
        const parsedTodos = JSON.parse(savedTodos) as Partial<Todo>[];
        const normalizedTodos: Todo[] = parsedTodos.map((todo, index) => ({
          id: todo.id ?? crypto.randomUUID(),
          text: todo.text ?? "",
          description: todo.description ?? "",
          completed: Boolean(todo.completed),
          dueAt: todo.dueAt ?? null,
          createdAt: todo.createdAt ?? Date.now() + index,
        }));
        setTodos(normalizedTodos);
      } catch (e) {
        console.error("Failed to parse todos from local storage", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("todos", JSON.stringify(todos));
    }
  }, [todos, isLoaded]);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const nowIso = getNowDateTimeLocal();
    const selectedDueAt = shouldSetDateTime
      ? dateTimeValue < nowIso
        ? nowIso
        : dateTimeValue
      : null;

    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: inputValue.trim(),
      description: descriptionValue.trim(),
      completed: false,
      dueAt: selectedDueAt,
      createdAt: Date.now(),
    };

    setTodos([...todos, newTodo]);
    setInputValue("");
    setDescriptionValue("");
    setShouldSetDateTime(true);
    setDateTimeValue(getNowDateTimeLocal());
  };

  const toggleTodo = (id: string) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((todo) => todo.id !== id));
  };

  const startEditingTodo = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditDescription(todo.description);
    setEditShouldSetDateTime(Boolean(todo.dueAt));
    setEditDateTime(todo.dueAt ?? getNowDateTimeLocal());
  };

  const cancelEditingTodo = () => {
    setEditingId(null);
    setEditText("");
    setEditDescription("");
    setEditShouldSetDateTime(true);
    setEditDateTime(getNowDateTimeLocal());
  };

  const saveEditingTodo = (id: string) => {
    if (!editText.trim()) return;

    const nowIso = getNowDateTimeLocal();
    const selectedDueAt = editShouldSetDateTime
      ? editDateTime < nowIso
        ? nowIso
        : editDateTime
      : null;

    setTodos(
      todos.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              text: editText.trim(),
              description: editDescription.trim(),
              dueAt: selectedDueAt,
            }
          : todo,
      ),
    );
    cancelEditingTodo();
  };

  if (!isLoaded) {
    return null;
  }

  const completedCount = todos.filter((t) => t.completed).length;
  const sortedTodos = sortTodos(todos);
  const minDateTime = getNowDateTimeLocal();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8 font-sans text-zinc-900 dark:text-zinc-100 flex justify-center items-start">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6 text-center">Todo List</h1>

          <form onSubmit={addTodo} className="space-y-3 mb-6">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
            />

            <textarea
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow resize-none"
            />

            <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
              <span>Set date & time</span>
              <button
                type="button"
                onClick={() => setShouldSetDateTime((value) => !value)}
                aria-label="Toggle datetime"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  shouldSetDateTime
                    ? "bg-blue-600 dark:bg-blue-500"
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

            {shouldSetDateTime && (
              <input
                type="datetime-local"
                value={dateTimeValue}
                onChange={(e) => setDateTimeValue(e.target.value)}
                min={minDateTime}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
              />
            )}

            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Add Todo
            </button>
          </form>

          <div className="space-y-3">
            {todos.length === 0 ? (
              <p className="text-center text-zinc-500 dark:text-zinc-400 py-4">
                No tasks yet. Add one above!
              </p>
            ) : (
              sortedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className={`p-3 rounded-lg border transition-all ${
                    todo.completed
                      ? "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-sm"
                  }`}
                >
                  {editingId === todo.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
                        <span>Set date & time</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditShouldSetDateTime((value) => !value)
                          }
                          aria-label="Toggle edit datetime"
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            editShouldSetDateTime
                              ? "bg-blue-600 dark:bg-blue-500"
                              : "bg-zinc-300 dark:bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                              editShouldSetDateTime
                                ? "translate-x-5"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </label>
                      {editShouldSetDateTime && (
                        <input
                          type="datetime-local"
                          value={editDateTime}
                          onChange={(e) => setEditDateTime(e.target.value)}
                          min={minDateTime}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => cancelEditingTodo()}
                          className="px-3 py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <X size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditingTodo(todo.id)}
                          disabled={!editText.trim()}
                          className="px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
                        >
                          <Save size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                          <button
                            onClick={() => toggleTodo(todo.id)}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                              todo.completed
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-zinc-300 dark:border-zinc-600 hover:border-green-500 dark:hover:border-green-400"
                            }`}
                          >
                            {todo.completed && (
                              <Check size={14} strokeWidth={3} />
                            )}
                          </button>
                          <span
                            className={`truncate transition-all ${
                              todo.completed
                                ? "text-zinc-400 dark:text-zinc-500 line-through"
                                : "text-zinc-700 dark:text-zinc-200"
                            }`}
                          >
                            {todo.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditingTodo(todo)}
                            className="p-2 text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            aria-label="Edit todo"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            onClick={() => deleteTodo(todo.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-md hover:bg-red-50 dark:hover:bg-red-950/30"
                            aria-label="Delete todo"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      {todo.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 pl-9 break-words">
                          {todo.description}
                        </p>
                      )}

                      {todo.dueAt && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-9">
                          {new Date(todo.dueAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {todos.length > 0 && (
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              {completedCount} of {todos.length} completed
            </span>
            {completedCount > 0 && (
              <button
                onClick={() => setTodos(todos.filter((t) => !t.completed))}
                className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", {
        cache: "no-store",
      });
      const data = await response.json();
      setIsAuthenticated(Boolean(data.authenticated));
      setUserId(data.userId ?? null);
    } catch {
      setIsAuthenticated(false);
      setUserId(null);
      setAuthError("Failed to check authentication status.");
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const registerWithPasskey = async () => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const startResponse = await fetch("/api/auth/register/start", {
        method: "POST",
      });
      if (!startResponse.ok) {
        throw new Error("Failed to start registration");
      }

      const options = await startResponse.json();
      const registration = await startRegistration(options);

      const finishResponse = await fetch("/api/auth/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });

      if (!finishResponse.ok) {
        const payload = await finishResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to finish registration");
      }

      await checkAuth();
    } catch (error) {
      setAuthError((error as Error).message);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginWithPasskey = async () => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const startResponse = await fetch("/api/auth/login/start", {
        method: "POST",
      });
      if (!startResponse.ok) {
        throw new Error("Failed to start login");
      }

      const options = await startResponse.json();
      const authentication = await startAuthentication(options);

      const finishResponse = await fetch("/api/auth/login/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authentication),
      });

      if (!finishResponse.ok) {
        const payload = await finishResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to finish login");
      }

      await checkAuth();
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIsAuthenticated(false);
      setUserId(null);
    } catch {
      setAuthError("Failed to log out.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8 font-sans text-zinc-900 dark:text-zinc-100 flex justify-center items-start">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden p-6 space-y-4">
          <h1 className="text-2xl font-bold text-center">Todo Passkey Login</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Use a passkey to register or log in.
          </p>

          {authError && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              {authError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={registerWithPasskey}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
            >
              Register with Passkey
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={loginWithPasskey}
              className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-900 disabled:bg-zinc-500 dark:bg-zinc-200 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-500 text-white dark:text-zinc-900 rounded-lg transition-colors"
            >
              Login with Passkey
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md mx-auto px-4 pt-6 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
        <span className="truncate">Signed in: {userId}</span>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={logout}
          className="px-3 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Logout
        </button>
      </div>
      <TodoApp />
    </div>
  );
}
