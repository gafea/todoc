"use client";

import { useCallback, useEffect, useState } from "react";
import { TodoCard } from "@/components/todo-card";
import {
  createShareBan,
  fetchShareBans,
  fetchTodos,
  removeShareBan,
  removeSharedTodo,
  ShareBanItem,
  TodoItem,
} from "@/lib/todo-client";

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
  const [bans, setBans] = useState<ShareBanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = useCallback(async () => {
    try {
      setError(null);
      const [payload, bansPayload] = await Promise.all([
        fetchTodos(),
        fetchShareBans(),
      ]);
      setTodos(payload.sharedWithMe);
      setBans(bansPayload);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    const handleTodoCreated = () => {
      void loadTodos();
    };

    window.addEventListener("todo:created", handleTodoCreated);
    return () => {
      window.removeEventListener("todo:created", handleTodoCreated);
    };
  }, [loadTodos]);

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

  const banUser = async (blockedUserId: string) => {
    try {
      setIsMutating(true);
      setError(null);
      await createShareBan(blockedUserId);
      await loadTodos();
    } catch (banError) {
      setError((banError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const unbanUser = async (blockedUserId: string) => {
    try {
      setIsMutating(true);
      setError(null);
      await removeShareBan(blockedUserId);
      await loadTodos();
    } catch (unbanError) {
      setError((unbanError as Error).message);
    } finally {
      setIsMutating(false);
    }
  };

  const sortedTodos = sortTodos(todos);
  const todosByOwner = sortedTodos.reduce<Record<string, TodoItem[]>>(
    (accumulator, todo) => {
      const ownerKey = todo.ownerId;
      const currentTodos = accumulator[ownerKey] ?? [];
      currentTodos.push(todo);
      accumulator[ownerKey] = sortTodos(currentTodos);
      return accumulator;
    },
    {},
  );

  const ownerIds = Object.keys(todosByOwner).sort((first, second) => {
    const firstSoonest = todosByOwner[first]?.[0]?.dueAt
      ? new Date(todosByOwner[first][0].dueAt as string).getTime()
      : Number.MAX_SAFE_INTEGER;
    const secondSoonest = todosByOwner[second]?.[0]?.dueAt
      ? new Date(todosByOwner[second][0].dueAt as string).getTime()
      : Number.MAX_SAFE_INTEGER;
    return firstSoonest - secondSoonest;
  });

  const bannedUserIds = new Set(bans.map((ban) => ban.blockedUserId));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shared with Me</h1>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {bans.length > 0 && (
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Ban List</h2>
          <div className="flex flex-wrap gap-2">
            {bans.map((ban) => (
              <button
                key={ban.id}
                type="button"
                disabled={isMutating}
                onClick={() => unbanUser(ban.blockedUserId)}
                className="px-3 py-1.5 rounded-md text-sm bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Unban {ban.blockedUserId}
              </button>
            ))}
          </div>
        </section>
      )}

      {isLoading ? null : sortedTodos.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No shared todos.</p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex items-start gap-4 min-w-full">
            {ownerIds.map((ownerId) => {
              const ownerTodos = todosByOwner[ownerId] ?? [];
              const isBanned = bannedUserIds.has(ownerId);

              return (
                <section
                  key={ownerId}
                  className="w-80 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold break-all">{ownerId}</h2>
                    </div>
                    {isBanned ? (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => unbanUser(ownerId)}
                        className="px-3 py-1.5 rounded-md text-sm bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => banUser(ownerId)}
                        className="px-3 py-1.5 rounded-md text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
                      >
                        Ban
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {ownerTodos.map((todo) => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        isOwnedByCurrentUser={false}
                        isMutating={isMutating}
                        dueText={
                          todo.dueAt
                            ? `Due: ${new Date(todo.dueAt).toLocaleString()}`
                            : "Due: Not set"
                        }
                        footerAction={
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => removeFromShared(todo.id)}
                            className="w-full px-3 py-2 rounded-md text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
                          >
                            Remove
                          </button>
                        }
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
