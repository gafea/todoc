import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.userId) {
    return NextResponse.json({ authenticated: false });
  }

  const credentialCount = await prisma.credential.count({
    where: { userId: session.userId },
  });

  if (credentialCount === 0) {
    return NextResponse.json({ authenticated: false, pending: true });
  }

  return NextResponse.json({ authenticated: true, userId: session.userId });
}
