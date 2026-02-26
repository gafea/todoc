export type CallSessionPayload = {
  id: string;
  todoId: string;
  initiatorUserId: string;
  recipientUserId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
};

export type CallSignalPayload = {
  id: string;
  fromUserId: string;
  toUserId: string;
  payload: unknown;
  createdAt: string;
};

export class CallApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CallApiError";
    this.status = status;
  }
}

export const startCallForTodo = async (todoId: string) => {
  const response = await fetch(`/api/todos/${todoId}/call/start`, {
    method: "POST",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to start call");
  }

  return payload as {
    session: CallSessionPayload;
    role: "A" | "B";
  };
};

export const pollCallForTodo = async (todoId: string) => {
  const response = await fetch(`/api/todos/${todoId}/call`, {
    cache: "no-store",
  });

  const rawBody = await response.text().catch(() => "");
  const payload = (() => {
    try {
      return rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    throw new CallApiError(
      payload?.error ||
        (rawBody ? `${rawBody.slice(0, 180)}` : "Failed to poll call"),
      response.status,
    );
  }

  return payload as {
    session: CallSessionPayload | null;
    signals: CallSignalPayload[];
  };
};

export const sendCallSignal = async (
  todoId: string,
  signalPayload: unknown,
) => {
  const response = await fetch(`/api/todos/${todoId}/call/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: signalPayload }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to send call signal");
  }
};

export const endCallBySharedUser = async (input: {
  todoId: string;
  markDone: boolean;
  rescheduleDueAt?: string;
}) => {
  const response = await fetch(`/api/todos/${input.todoId}/call/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markDone: input.markDone,
      rescheduleDueAt: input.rescheduleDueAt,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to stop call");
  }

  return payload as {
    success: boolean;
    todo: {
      id: string;
      completed: boolean;
      dueAt: string | null;
    };
  };
};
