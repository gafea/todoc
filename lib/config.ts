const normalizeOrigin = (value: string) => value.replace(/\/+$/, "");

const resolveBaseUrl = () => {
  const candidate =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!candidate) {
    throw new Error(
      "APP_BASE_URL is not set. Define APP_BASE_URL (and optionally NEXT_PUBLIC_APP_URL) in your .env file.",
    );
  }

  return normalizeOrigin(candidate.trim());
};

const baseUrl = resolveBaseUrl();
const expectedOrigin = normalizeOrigin(baseUrl.trim());

const deriveRpId = () => {
  if (process.env.RP_ID) {
    return process.env.RP_ID;
  }

  try {
    return new URL(expectedOrigin).hostname;
  } catch {
    throw new Error(
      `Unable to derive RP_ID from ${expectedOrigin}. Set RP_ID explicitly in your .env file.`,
    );
  }
};

export const appConfig = {
  appBaseUrl: baseUrl,
  expectedOrigin,
  rpId: deriveRpId(),
};
