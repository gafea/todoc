import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

const serializeSession = (session: {
  id: string;
  todoId: string;
  initiatorUserId: string;
  recipientUserId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}) => ({
  id: session.id,
  todoId: session.todoId,
  initiatorUserId: session.initiatorUserId,
  recipientUserId: session.recipientUserId,
  status: session.status,
  startedAt: session.startedAt.toISOString(),
  endedAt: session.endedAt?.toISOString() ?? null,
});

export async function POST(
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
  const todo = await prisma.todo.findUnique({ where: { id } });

  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  if (
    session.userId !== todo.ownerId &&
    session.userId !== todo.sharedWithUserId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!todo.sharedWithUserId) {
    return NextResponse.json(
      { error: "Todo is not shared with another user" },
      { status: 400 },
    );
  }

  if (!todo.dueAt || todo.completed) {
    return NextResponse.json(
      { error: "Todo is not eligible for call start" },
      { status: 400 },
    );
  }

  const startMeetingBeforeMs =
    Math.max(0, todo.startMeetingBeforeMin ?? 0) * 60 * 1000;
  const callStartAtMs = todo.dueAt.getTime() - startMeetingBeforeMs;

  if (callStartAtMs > Date.now()) {
    return NextResponse.json(
      { error: "Call can only start when due date/time is reached" },
      { status: 400 },
    );
  }

  const existing = await prisma.callSession.findUnique({
    where: { todoId: id },
  });

  let callSession;
  if (!existing) {
    callSession = await prisma.callSession.create({
      data: {
        todoId: todo.id,
        initiatorUserId: todo.ownerId,
        recipientUserId: todo.sharedWithUserId,
        status: "active",
      },
    });
  } else if (existing.status !== "active") {
    callSession = await prisma.callSession.update({
      where: { id: existing.id },
      data: {
        initiatorUserId: todo.ownerId,
        recipientUserId: todo.sharedWithUserId,
        status: "active",
        startedAt: new Date(),
        endedAt: null,
      },
    });
  } else {
    callSession = existing;
  }

  return NextResponse.json({
    session: serializeSession(callSession),
    role: session.userId === todo.ownerId ? "A" : "B",
  });
}
