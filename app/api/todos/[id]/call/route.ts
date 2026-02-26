import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

const parseSignalPayload = (payload: string) => {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

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

export async function GET(
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

  const callSession = await prisma.callSession.findUnique({
    where: { todoId: id },
  });

  if (!callSession) {
    return NextResponse.json({ session: null, signals: [] });
  }

  const signals = await prisma.callSignal.findMany({
    where: {
      callSessionId: callSession.id,
      toUserId: session.userId,
      deliveredAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  if (signals.length > 0) {
    await prisma.callSignal.updateMany({
      where: { id: { in: signals.map((signal) => signal.id) } },
      data: { deliveredAt: new Date() },
    });
  }

  return NextResponse.json({
    session: serializeSession(callSession),
    signals: signals.map((signal) => ({
      id: signal.id,
      fromUserId: signal.fromUserId,
      toUserId: signal.toUserId,
      payload: parseSignalPayload(signal.payload),
      createdAt: signal.createdAt.toISOString(),
    })),
  });
}
