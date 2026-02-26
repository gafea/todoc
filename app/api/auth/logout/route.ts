import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { AuthSessionData, sessionOptions } from "@/lib/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  delete session.userId;
  delete session.challenge;
  delete session.pendingUserId;

  await session.save();

  const finalResponse = NextResponse.json({ success: true });
  finalResponse.headers.set(
    "Set-Cookie",
    response.headers.get("Set-Cookie") || "",
  );
  return finalResponse;
}
