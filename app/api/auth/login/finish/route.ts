import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getIronSession } from "iron-session";
import { appConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { AuthSessionData, sessionOptions } from "@/lib/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<AuthSessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.challenge) {
    return NextResponse.json({ error: "No challenge" }, { status: 400 });
  }

  const body = await request.json();

  const credential = await prisma.credential.findUnique({
    where: { credentialId: body.id },
  });

  if (!credential) {
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: session.challenge,
      expectedOrigin: appConfig.expectedOrigin,
      expectedRPID: appConfig.rpId,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64")),
        counter: credential.counter,
        transports: JSON.parse(credential.transports || "[]"),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Verification failed: ${(error as Error).message}` },
      { status: 400 },
    );
  }

  const { verified, authenticationInfo } = verification;

  if (!verified || !authenticationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  await prisma.credential.update({
    where: { credentialId: credential.credentialId },
    data: { counter: authenticationInfo.newCounter },
  });

  session.userId = credential.userId;
  delete session.challenge;

  await session.save();

  const finalResponse = NextResponse.json({
    success: true,
    userId: credential.userId,
  });
  finalResponse.headers.set(
    "Set-Cookie",
    response.headers.get("Set-Cookie") || "",
  );
  return finalResponse;
}
