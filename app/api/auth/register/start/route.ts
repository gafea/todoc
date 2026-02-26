import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getIronSession } from "iron-session";
import { appConfig } from "@/lib/config";
import { AuthSessionData, sessionOptions } from "@/lib/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  const pendingUserId = crypto.randomUUID();

  const options = await generateRegistrationOptions({
    rpName: "Todo",
    rpID: appConfig.rpId,
    userID: new Uint8Array(Buffer.from(pendingUserId, "utf8")),
    userName: `todo-${pendingUserId}`,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  session.challenge = options.challenge;
  session.pendingUserId = pendingUserId;

  await session.save();

  const finalResponse = NextResponse.json(options);
  finalResponse.headers.set(
    "Set-Cookie",
    response.headers.get("Set-Cookie") || "",
  );
  return finalResponse;
}
