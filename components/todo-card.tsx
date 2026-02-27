import { type ReactNode } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { type TodoItem } from "@/lib/todo-client";

type TodoCardProps = {
  todo: TodoItem;
  isOwnedByCurrentUser: boolean;
  isMutating?: boolean;
  onEdit?: (todo: TodoItem) => void;
  onDelete?: (todo: TodoItem) => void;
  onToggleComplete?: (todo: TodoItem) => void;
  dueText?: string;
  metaText?: string;
  className?: string;
  extraInfo?: ReactNode;
  footerAction?: ReactNode;
};

export function TodoCard({
  todo,
  isOwnedByCurrentUser,
  isMutating,
  onEdit,
  onDelete,
  onToggleComplete,
  dueText,
  metaText,
  className,
  extraInfo,
  footerAction,
}: TodoCardProps) {
  const showCompleteButton =
    isOwnedByCurrentUser && !todo.sharedWithUserId && Boolean(onToggleComplete);

  return (
    <article
      className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 ${className ?? ""}`.trim()}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`font-medium break-words ${todo.completed ? "line-through text-zinc-500" : ""}`.trim()}
        >
          {todo.text}
        </h3>

        {isOwnedByCurrentUser ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!onEdit || isMutating}
              onClick={() => onEdit?.(todo)}
              className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              aria-label="Edit todo"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              disabled={!onDelete || isMutating}
              onClick={() => onDelete?.(todo)}
              className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 disabled:opacity-50"
              aria-label="Delete todo"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              Shared with Me
            </span>
          </div>
        )}
      </div>

      {todo.description ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {todo.description}
        </p>
      ) : null}

      {dueText ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{dueText}</p>
      ) : null}

      {extraInfo}

      {metaText ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{metaText}</p>
      ) : null}

      {showCompleteButton ? (
        <button
          type="button"
          onClick={() => onToggleComplete?.(todo)}
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
      ) : null}

      {footerAction}
    </article>
  );
}
