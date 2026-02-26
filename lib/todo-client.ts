export interface TodoItem {
  id: string;
  text: string;
  description: string;
  completed: boolean;
  dueAt: string | null;
  createdAt: string;
  ownerId: string;
  sharedWithUserId: string | null;
}

export interface TodosPayload {
  owned: TodoItem[];
  sharedWithMe: TodoItem[];
}

export const fetchTodos = async (): Promise<TodosPayload> => {
  const response = await fetch("/api/todos", { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load todos");
  }

  return {
    owned: (payload?.owned ?? []) as TodoItem[],
    sharedWithMe: (payload?.sharedWithMe ?? []) as TodoItem[],
  };
};

export const createTodo = async (input: {
  text: string;
  description: string;
  dueAt: string | null;
  sharedWithUserId: string | null;
}) => {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to create todo");
  }
  return payload as TodoItem;
};

export const updateTodo = async (
  id: string,
  input: Partial<{
    text: string;
    description: string;
    completed: boolean;
    dueAt: string | null;
    sharedWithUserId: string | null;
  }>,
) => {
  const response = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to update todo");
  }
  return payload as TodoItem;
};

export const deleteTodo = async (id: string) => {
  const response = await fetch(`/api/todos/${id}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to delete todo");
  }
};

export const removeSharedTodo = async (id: string) => {
  const response = await fetch(`/api/todos/${id}/remove-shared`, {
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to remove shared todo");
  }
};

export const toLocalDateTimeInput = (value: string | null) => {
  if (!value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }

  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
