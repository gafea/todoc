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
  createdAt: Date;
  ownerId: string;
  sharedWithUserId: string | null;
}) => ({
  id: todo.id,
  text: todo.text,
  description: todo.description,
  completed: todo.completed,
  dueAt: todo.dueAt?.toISOString() ?? null,
  createdAt: todo.createdAt.toISOString(),
  ownerId: todo.ownerId,
  sharedWithUserId: todo.sharedWithUserId,
});

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ownedTodos, sharedWithMeTodos] = await Promise.all([
    prisma.todo.findMany({
      where: { ownerId: session.userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.todo.findMany({
      where: { sharedWithUserId: session.userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    currentUserId: session.userId,
    owned: ownedTodos.map(serializeTodo),
    sharedWithMe: sharedWithMeTodos.map(serializeTodo),
  });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  try {
    const [dueAt, sharedWithUserId] = await Promise.all([
      Promise.resolve(parseDueAt(body?.dueAt)),
      parseSharedWithUserId(body?.sharedWithUserId, session.userId),
    ]);

    const todo = await prisma.todo.create({
      data: {
        text,
        description,
        completed: false,
        dueAt,
        ownerId: session.userId,
        sharedWithUserId,
      },
    });

    return NextResponse.json(serializeTodo(todo));
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create todo" },
      { status: 400 },
    );
  }
}
