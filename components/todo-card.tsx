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
  className,
  extraInfo,
  footerAction,
}: TodoCardProps) {
  const isSharedCompletedLocked =
    isOwnedByCurrentUser && Boolean(todo.sharedWithUserId) && todo.completed;

  const showCompleteButton =
    isOwnedByCurrentUser &&
    Boolean(onToggleComplete) &&
    (!todo.sharedWithUserId || isSharedCompletedLocked);

  return (
    <article
      className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 ${className ?? ""}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className={`font-medium break-words gap-2 ${todo.completed ? "line-through text-zinc-500" : ""}`.trim()}
        >
          {todo.text}
          {extraInfo}
        </h3>

        {isOwnedByCurrentUser ? (
          onEdit && onDelete ? (
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
                Mine
              </span>
            </div>
          )
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

      {todo.dueAt && todo.sharedWithUserId && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Meeting starts on{" "}
          {new Date(
            new Date(todo.dueAt).getTime() - todo.startMeetingBeforeMin * 60000,
          ).toLocaleString()}
        </p>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {todo.dueAt
          ? `Due on ${new Date(todo.dueAt).toLocaleString()}`
          : `No due date`}
      </p>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {isOwnedByCurrentUser
          ? todo.sharedWithUserId
            ? `Shared with ${todo.sharedWithUserId}`
            : ""
          : `Shared by ${todo.ownerId}`}
      </p>

      {showCompleteButton ? (
        <button
          type="button"
          onClick={() => {
            if (isSharedCompletedLocked) {
              return;
            }
            onToggleComplete?.(todo);
          }}
          disabled={isMutating || isSharedCompletedLocked}
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
