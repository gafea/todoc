import { SessionOptions } from "iron-session";

export interface AuthSessionData {
  userId?: string;
  challenge?: string;
  pendingUserId?: string;
}

export const sessionOptions: SessionOptions = {
  password:
    process.env.SECRET_COOKIE_PASSWORD ||
    "complex_password_at_least_32_characters_long",
  cookieName: "webauthn-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

declare module "iron-session" {
  interface SessionData {
    userId?: string;
    challenge?: string;
    pendingUserId?: string;
  }
}
