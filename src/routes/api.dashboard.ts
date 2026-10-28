import { createFileRoute } from "@tanstack/react-router";
import { dashboardData, dashboardEnabled, isSignedIn, noStore } from "@/server/dashboard";

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!dashboardEnabled()) return noStore({ error: "The dashboard is not enabled." }, 503);
        if (!(await isSignedIn(request))) return noStore({ error: "Please sign in." }, 401);
        const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
        try {
          return noStore(await dashboardData(days));
        } catch (error) {
          console.error("Dashboard data failed", error);
          return noStore({ error: "AgentLabs could not be reached. Try again in a minute." }, 502);
        }
      },
    },
  },
});
