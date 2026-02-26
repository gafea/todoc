import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

const parseFutureDueAt = (rawValue: unknown) => {
  if (typeof rawValue !== "string") {
    throw new Error("A new due date/time is required");
  }

  const dueAt = new Date(rawValue);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error("Invalid due date/time");
  }

  if (dueAt.getTime() <= Date.now()) {
    throw new Error("New due date/time must be in the future");
  }

  return dueAt;
};

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

  if (!todo.sharedWithUserId) {
    return NextResponse.json(
      { error: "Todo is not shared with another user" },
      { status: 400 },
    );
  }

  if (session.userId !== todo.sharedWithUserId) {
    return NextResponse.json(
      { error: "Only the shared user (B) can stop this call" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const markDone = body?.markDone;

  if (typeof markDone !== "boolean") {
    return NextResponse.json(
      { error: "markDone boolean is required" },
      { status: 400 },
    );
  }

  try {
    const updatedTodo = await prisma.$transaction(async (tx) => {
      const existingSession = await tx.callSession.findUnique({
        where: { todoId: todo.id },
      });

      if (existingSession) {
        await tx.callSession.update({
          where: { id: existingSession.id },
          data: { status: "ended", endedAt: new Date() },
        });
      }

      if (markDone) {
        return tx.todo.update({
          where: { id: todo.id },
          data: { completed: true },
        });
      }

      const nextDueAt = parseFutureDueAt(body?.rescheduleDueAt);
      if (todo.dueAt && nextDueAt.getTime() <= todo.dueAt.getTime()) {
        throw new Error(
          "New due date/time must be later than current due date/time",
        );
      }

      return tx.todo.update({
        where: { id: todo.id },
        data: {
          completed: false,
          dueAt: nextDueAt,
        },
      });
    });

    return NextResponse.json({
      success: true,
      todo: {
        id: updatedTodo.id,
        completed: updatedTodo.completed,
        dueAt: updatedTodo.dueAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to end call" },
      { status: 400 },
    );
  }
}
