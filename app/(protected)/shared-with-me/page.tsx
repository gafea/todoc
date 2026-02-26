"use client";

import { useEffect, useState } from "react";
import { Trash } from "lucide-react";
import { fetchTodos, removeSharedTodo, TodoItem } from "@/lib/todo-client";

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

export default function SharedWithMePage() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = async () => {
    try {
      setError(null);
      const payload = await fetchTodos();
      setTodos(payload.sharedWithMe);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const removeFromShared = async (id: string) => {
    try {
      setIsMutating(true);
      setError(null);
      await removeSharedTodo(id);
      await loadTodos();
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const sortedTodos = sortTodos(todos);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shared with Me</h1>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {isLoading ? null : sortedTodos.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No shared todos.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedTodos.map((todo) => (
            <div
              key={todo.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold break-words">{todo.text}</h2>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => removeFromShared(todo.id)}
                  className="px-3 py-1.5 rounded-md text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white inline-flex items-center gap-1"
                >
                  <Trash size={14} />
                  Remove
                </button>
              </div>

              {todo.description && (
                <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words">
                  {todo.description}
                </p>
              )}

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Shared by: {todo.ownerId}
              </p>

              {todo.dueAt && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Due: {new Date(todo.dueAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
