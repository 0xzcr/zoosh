export function getAppUrl(requestUrl?: string) {
  const configured = process.env.APP_URL?.trim();
  if (configured && !configured.includes("your-vercel-domain.example")) return configured.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  throw new Error("APP_URL is required for provider callbacks and settlement links.");
}
