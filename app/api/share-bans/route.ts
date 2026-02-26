import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

const getSessionUserId = async (request: NextRequest) => {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  return session.userId ?? null;
};

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bans = await prisma.userShareBan.findMany({
    where: { blockerUserId: userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    bans: bans.map((ban) => ({
      id: ban.id,
      blockerUserId: ban.blockerUserId,
      blockedUserId: ban.blockedUserId,
      createdAt: ban.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const blockedUserId =
    typeof body?.blockedUserId === "string" ? body.blockedUserId.trim() : "";

  if (!blockedUserId) {
    return NextResponse.json(
      { error: "blockedUserId is required" },
      { status: 400 },
    );
  }

  if (blockedUserId === userId) {
    return NextResponse.json(
      { error: "You cannot ban yourself" },
      { status: 400 },
    );
  }

  const blockedUser = await prisma.user.findUnique({
    where: { id: blockedUserId },
    select: { id: true },
  });

  if (!blockedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const ban = await prisma.userShareBan.upsert({
    where: {
      blockerUserId_blockedUserId: {
        blockerUserId: userId,
        blockedUserId,
      },
    },
    create: {
      blockerUserId: userId,
      blockedUserId,
    },
    update: {},
  });

  await prisma.todo.updateMany({
    where: {
      ownerId: blockedUserId,
      sharedWithUserId: userId,
    },
    data: {
      sharedWithUserId: null,
    },
  });

  return NextResponse.json({
    id: ban.id,
    blockerUserId: ban.blockerUserId,
    blockedUserId: ban.blockedUserId,
    createdAt: ban.createdAt.toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const blockedUserId =
    typeof body?.blockedUserId === "string" ? body.blockedUserId.trim() : "";

  if (!blockedUserId) {
    return NextResponse.json(
      { error: "blockedUserId is required" },
      { status: 400 },
    );
  }

  await prisma.userShareBan.deleteMany({
    where: {
      blockerUserId: userId,
      blockedUserId,
    },
  });

  return NextResponse.json({ success: true });
}
