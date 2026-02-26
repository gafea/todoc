"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  localDateTimeInputToIso,
  TodoItem,
  toLocalDateTimeInput,
  updateTodo,
} from "@/lib/todo-client";

const getNowDateTimeLocal = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const sortTodos = (items: TodoItem[]) => {
  return [...items].sort((first, second) => {
    if (!first.dueAt && !second.dueAt) {
      return (
        new Date(first.createdAt).getTime() -
        new Date(second.createdAt).getTime()
      );
    }
    if (!first.dueAt) return -1;
    if (!second.dueAt) return 1;
    return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime();
  });
};

type TodoDialogState = {
  mode: "create" | "edit";
  todoId: string | null;
  text: string;
  description: string;
  shouldSetDateTime: boolean;
  dueAtInput: string;
  sharedWithUserId: string;
};

const initialDialogState = (): TodoDialogState => ({
  mode: "create",
  todoId: null,
  text: "",
  description: "",
  shouldSetDateTime: true,
  dueAtInput: getNowDateTimeLocal(),
  sharedWithUserId: "",
});

export default function MyTodosPage() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] =
    useState<TodoDialogState>(initialDialogState());

  const loadTodos = async () => {
    try {
      setError(null);
      const data = await fetchTodos();
      setTodos(data.owned);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const sortedTodos = useMemo(() => sortTodos(todos), [todos]);
  const minDateTime = getNowDateTimeLocal();

  const openCreateDialog = () => {
    setDialogState(initialDialogState());
    setDialogOpen(true);
  };

  const openEditDialog = (todo: TodoItem) => {
    setDialogState({
      mode: "edit",
      todoId: todo.id,
      text: todo.text,
      description: todo.description,
      shouldSetDateTime: Boolean(todo.dueAt),
      dueAtInput: toLocalDateTimeInput(todo.dueAt),
      sharedWithUserId: todo.sharedWithUserId ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogState(initialDialogState());
  };

  const saveDialog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dialogState.text.trim()) return;

    const selectedDueAt = dialogState.shouldSetDateTime
      ? localDateTimeInputToIso(dialogState.dueAtInput)
      : null;

    try {
      setIsMutating(true);
      setError(null);

      if (dialogState.mode === "create") {
        await createTodo({
          text: dialogState.text.trim(),
          description: dialogState.description.trim(),
          dueAt: selectedDueAt,
          sharedWithUserId: dialogState.sharedWithUserId.trim() || null,
        });
      } else if (dialogState.todoId) {
        await updateTodo(dialogState.todoId, {
          text: dialogState.text.trim(),
          description: dialogState.description.trim(),
          dueAt: selectedDueAt,
          sharedWithUserId: dialogState.sharedWithUserId.trim() || null,
        });
      }

      closeDialog();
      await loadTodos();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const toggleCompleted = async (todo: TodoItem) => {
    try {
      setIsMutating(true);
      setError(null);
      await updateTodo(todo.id, { completed: !todo.completed });
      await loadTodos();
    } catch (toggleError) {
      setError((toggleError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const removeTodo = async (id: string) => {
    try {
      setIsMutating(true);
      setError(null);
      await deleteTodo(id);
      await loadTodos();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My Todos</h1>
        <button
          type="button"
          onClick={openCreateDialog}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2"
        >
          <Plus size={16} />
          New Todo
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {isLoading ? null : sortedTodos.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No todos yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedTodos.map((todo) => (
            <div
              key={todo.id}
              className={`rounded-xl border p-4 space-y-3 ${
                todo.completed
                  ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2
                  className={`font-semibold break-words ${
                    todo.completed ? "line-through text-zinc-500" : ""
                  }`}
                >
                  {todo.text}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditDialog(todo)}
                    className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Edit todo"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTodo(todo.id)}
                    disabled={isMutating}
                    className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                    aria-label="Delete todo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {todo.description && (
                <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words">
                  {todo.description}
                </p>
              )}

              {todo.dueAt && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Due: {new Date(todo.dueAt).toLocaleString()}
                </p>
              )}

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Shared with: {todo.sharedWithUserId || "No one"}
              </p>

              <button
                type="button"
                onClick={() => toggleCompleted(todo)}
                disabled={isMutating}
                className={`w-full px-3 py-2 rounded-md text-sm inline-flex items-center justify-center gap-2 ${
                  todo.completed
                    ? "bg-zinc-200 dark:bg-zinc-800"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                <Check size={14} />
                {todo.completed ? "Completed" : "Mark Complete"}
              </button>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {dialogState.mode === "create" ? "Create Todo" : "Edit Todo"}
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={saveDialog} className="space-y-3">
              <input
                type="text"
                value={dialogState.text}
                onChange={(e) =>
                  setDialogState((current) => ({
                    ...current,
                    text: e.target.value,
                  }))
                }
                placeholder="Todo title"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />

              <textarea
                value={dialogState.description}
                onChange={(e) =>
                  setDialogState((current) => ({
                    ...current,
                    description: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent resize-none"
              />

              <input
                type="text"
                value={dialogState.sharedWithUserId}
                onChange={(e) =>
                  setDialogState((current) => ({
                    ...current,
                    sharedWithUserId: e.target.value,
                  }))
                }
                placeholder="Share with user UUID (optional)"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />

              <label className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
                <span>Set date & time</span>
                <button
                  type="button"
                  onClick={() =>
                    setDialogState((current) => ({
                      ...current,
                      shouldSetDateTime: !current.shouldSetDateTime,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    dialogState.shouldSetDateTime
                      ? "bg-blue-600"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      dialogState.shouldSetDateTime
                        ? "translate-x-5"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {dialogState.shouldSetDateTime && (
                <input
                  type="datetime-local"
                  min={minDateTime}
                  value={dialogState.dueAtInput}
                  onChange={(e) =>
                    setDialogState((current) => ({
                      ...current,
                      dueAtInput: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent"
                />
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!dialogState.text.trim() || isMutating}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
