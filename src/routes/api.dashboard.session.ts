import { createFileRoute } from "@tanstack/react-router";
import { checkPassword, clearCookie, dashboardEnabled, noStore, sessionCookie } from "@/server/dashboard";

const attempts = new Map<string, { count: number; until: number }>();

export const Route = createFileRoute("/api/dashboard/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!dashboardEnabled()) return noStore({ error: "The dashboard is not enabled." }, 503);
        // Slow down password guessing: 5 wrong tries per address locks it for 10 minutes.
        const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
        const record = attempts.get(ip);
        if (record && record.count >= 5 && record.until > Date.now()) {
          return noStore({ error: "Too many attempts. Try again in 10 minutes." }, 429);
        }
        const body = (await request.json().catch(() => ({}))) as { password?: unknown };
        if (typeof body.password !== "string" || !(await checkPassword(body.password))) {
          const count = record && record.until > Date.now() ? record.count + 1 : 1;
          attempts.set(ip, { count, until: Date.now() + 10 * 60_000 });
          return noStore({ error: "Wrong password." }, 401);
        }
        attempts.delete(ip);
        return noStore({ ok: true }, 200, { "Set-Cookie": await sessionCookie(request) });
      },
      DELETE: async () => noStore({ ok: true }, 200, { "Set-Cookie": clearCookie }),
    },
  },
});
