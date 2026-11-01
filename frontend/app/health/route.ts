// GET /health: which commit is deployed and which public settings this server
// sees, to debug a deployment. Key values are never shown, only whether they
// are set (NEXT_PUBLIC_* values are public anyway: they ship to browsers).
export const dynamic = "force-dynamic";

const host = (value?: string) => {
  try {
    return value ? new URL(value).host : null;
  } catch {
    return "not a valid URL";
  }
};

export function GET() {
  const settings = {
    NEXT_PUBLIC_SUPABASE_URL: host(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : null,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? null,
    SITE_URL: process.env.SITE_URL ?? null,
  };
  const missing = Object.entries(settings)
    .filter(([name, value]) => name !== "SITE_URL" && !value)
    .map(([name]) => name);
  const invalid = settings.NEXT_PUBLIC_SUPABASE_URL === "not a valid URL" ? ["NEXT_PUBLIC_SUPABASE_URL"] : [];

  return Response.json(
    {
      ok: missing.length === 0 && invalid.length === 0,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      signInReady: Boolean(settings.NEXT_PUBLIC_SUPABASE_URL && settings.NEXT_PUBLIC_SUPABASE_ANON_KEY && !invalid.length),
      settings,
      missing,
      invalid,
      hint: missing.length
        ? "Add the missing variables in this Vercel project (Settings → Environment Variables, tick Production), then redeploy: Vercel applies variable changes only to new deployments."
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
