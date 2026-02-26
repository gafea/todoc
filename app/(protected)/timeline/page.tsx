"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTodos, TodoItem } from "@/lib/todo-client";

const monthColorClasses = [
  "border-blue-300 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-950/30",
  "border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30",
  "border-violet-300 dark:border-violet-700 bg-violet-50/70 dark:bg-violet-950/30",
  "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30",
  "border-rose-300 dark:border-rose-700 bg-rose-50/70 dark:bg-rose-950/30",
  "border-cyan-300 dark:border-cyan-700 bg-cyan-50/70 dark:bg-cyan-950/30",
  "border-lime-300 dark:border-lime-700 bg-lime-50/70 dark:bg-lime-950/30",
  "border-fuchsia-300 dark:border-fuchsia-700 bg-fuchsia-50/70 dark:bg-fuchsia-950/30",
  "border-orange-300 dark:border-orange-700 bg-orange-50/70 dark:bg-orange-950/30",
  "border-sky-300 dark:border-sky-700 bg-sky-50/70 dark:bg-sky-950/30",
  "border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30",
  "border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/30",
];

type TimelineTodo = TodoItem & {
  source: "mine" | "shared";
};

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (month: string) => {
  const [year, monthPart] = month.split("-");
  return new Date(Number(year), Number(monthPart) - 1, 1).toLocaleString(
    undefined,
    {
      month: "long",
      year: "numeric",
    },
  );
};

export default function TimelinePage() {
  const [todos, setTodos] = useState<TimelineTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const payload = await fetchTodos();

        const withDueDates: TimelineTodo[] = [
          ...payload.owned.map((todo) => ({
            ...todo,
            source: "mine" as const,
          })),
          ...payload.sharedWithMe.map((todo) => ({
            ...todo,
            source: "shared" as const,
          })),
        ]
          .filter((todo) => Boolean(todo.dueAt))
          .sort(
            (first, second) =>
              new Date(first.dueAt as string).getTime() -
              new Date(second.dueAt as string).getTime(),
          );

        setTodos(withDueDates);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineTodo[]>();
    for (const todo of todos) {
      const key = monthKey(new Date(todo.dueAt as string));
      const current = groups.get(key) ?? [];
      current.push(todo);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [todos]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timeline</h1>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {isLoading ? null : grouped.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No todos with date and time set.
        </p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex items-stretch gap-0 min-w-full">
            {grouped.map(([month, monthTodos], index) => (
              <div key={month} className="inline-flex items-stretch">
                <section
                  className={`w-80 shrink-0 border rounded-lg p-4 ${monthColorClasses[index % monthColorClasses.length]}`}
                >
                  <h2 className="font-semibold mb-3">{monthLabel(month)}</h2>
                  <div className="space-y-3">
                    {monthTodos.map((todo) => (
                      <article
                        key={todo.id}
                        className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/70 p-3"
                      >
                        <p className="font-medium break-words">{todo.text}</p>
                        {todo.description && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 break-words">
                            {todo.description}
                          </p>
                        )}
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                          {new Date(todo.dueAt as string).toLocaleString()}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          {todo.source === "mine"
                            ? "From: My Todos"
                            : `From: Shared by ${todo.ownerId}`}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
                {index < grouped.length - 1 && (
                  <div className="mx-4 h-auto w-px bg-zinc-300 dark:bg-zinc-700 self-stretch" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
