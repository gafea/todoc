import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

const parseDueAt = (dueAt: unknown) => {
  if (dueAt === null || dueAt === undefined || dueAt === "") {
    return null;
  }
  if (typeof dueAt !== "string") {
    throw new Error("Invalid dueAt value");
  }

  const parsedDate = new Date(dueAt);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid dueAt date format");
  }

  return parsedDate;
};

const parseStartMeetingBeforeMin = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Invalid startMeetingBeforeMin value");
  }

  if (value < 0 || value > 1440) {
    throw new Error("startMeetingBeforeMin must be between 0 and 1440");
  }

  return value;
};

const parseSharedWithUserId = async (
  rawValue: unknown,
  ownerId: string,
): Promise<string | null> => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue !== "string") {
    throw new Error("Invalid sharedWithUserId value");
  }

  const sharedWithUserId = rawValue.trim();
  if (!sharedWithUserId) {
    return null;
  }

  if (sharedWithUserId === ownerId) {
    throw new Error("Cannot share a todo with yourself");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: sharedWithUserId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new Error("Shared user not found");
  }

  const isBlocked = await prisma.userShareBan.findUnique({
    where: {
      blockerUserId_blockedUserId: {
        blockerUserId: sharedWithUserId,
        blockedUserId: ownerId,
      },
    },
    select: { id: true },
  });

  if (isBlocked) {
    throw new Error("This user blocked receiving shared todos from you");
  }

  return sharedWithUserId;
};

const serializeTodo = (todo: {
  id: string;
  text: string;
  description: string;
  completed: boolean;
  dueAt: Date | null;
  startMeetingBeforeMin: number;
  createdAt: Date;
  ownerId: string;
  sharedWithUserId: string | null;
}) => ({
  id: todo.id,
  text: todo.text,
  description: todo.description,
  completed: todo.completed,
  dueAt: todo.dueAt?.toISOString() ?? null,
  startMeetingBeforeMin: todo.startMeetingBeforeMin,
  createdAt: todo.createdAt.toISOString(),
  ownerId: todo.ownerId,
  sharedWithUserId: todo.sharedWithUserId,
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existingTodo = await prisma.todo.findUnique({ where: { id } });

  if (!existingTodo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }
  if (existingTodo.ownerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  try {
    const data: {
      text?: string;
      description?: string;
      completed?: boolean;
      dueAt?: Date | null;
      sharedWithUserId?: string | null;
      startMeetingBeforeMin?: number;
    } = {};

    if ("text" in body) {
      if (typeof body.text !== "string" || !body.text.trim()) {
        return NextResponse.json(
          { error: "Text is required" },
          { status: 400 },
        );
      }
      data.text = body.text.trim();
    }

    if ("description" in body) {
      if (typeof body.description !== "string") {
        return NextResponse.json(
          { error: "Invalid description" },
          { status: 400 },
        );
      }
      data.description = body.description.trim();
    }

    if ("completed" in body) {
      if (typeof body.completed !== "boolean") {
        return NextResponse.json(
          { error: "Invalid completed value" },
          { status: 400 },
        );
      }

      if (
        existingTodo.sharedWithUserId &&
        existingTodo.completed &&
        body.completed === false
      ) {
        return NextResponse.json(
          { error: "Shared completed todos cannot be marked as incomplete" },
          { status: 400 },
        );
      }

      data.completed = body.completed;
    }

    if ("dueAt" in body) {
      data.dueAt = parseDueAt(body.dueAt);
    }

    if ("sharedWithUserId" in body) {
      data.sharedWithUserId = await parseSharedWithUserId(
        body.sharedWithUserId,
        session.userId,
      );
    }

    if ("startMeetingBeforeMin" in body) {
      data.startMeetingBeforeMin = parseStartMeetingBeforeMin(
        body.startMeetingBeforeMin,
      );
    }

    const nextDueAt =
      "dueAt" in data ? data.dueAt : (existingTodo.dueAt ?? null);
    const nextSharedWithUserId =
      "sharedWithUserId" in data
        ? data.sharedWithUserId
        : existingTodo.sharedWithUserId;

    if (nextSharedWithUserId && !nextDueAt) {
      throw new Error("Due date & time is required for shared todos");
    }

    const updatedTodo = await prisma.todo.update({
      where: { id },
      data,
    });

    return NextResponse.json(serializeTodo(updatedTodo));
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update todo" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existingTodo = await prisma.todo.findUnique({ where: { id } });

  if (!existingTodo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }
  if (existingTodo.ownerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.todo.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
