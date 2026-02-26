import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

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

  const callSession = await prisma.callSession.findUnique({
    where: { todoId: id },
  });

  if (!callSession || callSession.status !== "active") {
    return NextResponse.json(
      { error: "No active call session" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const payload = body?.payload;

  if (payload === undefined) {
    return NextResponse.json(
      { error: "Signal payload is required" },
      { status: 400 },
    );
  }

  const toUserId =
    session.userId === todo.ownerId ? todo.sharedWithUserId : todo.ownerId;

  if (!toUserId) {
    return NextResponse.json(
      { error: "Missing call recipient" },
      { status: 400 },
    );
  }

  await prisma.callSignal.create({
    data: {
      callSessionId: callSession.id,
      fromUserId: session.userId,
      toUserId,
      payload: JSON.stringify(payload),
    },
  });

  return NextResponse.json({ success: true });
}
