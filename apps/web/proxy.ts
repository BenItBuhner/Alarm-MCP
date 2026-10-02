import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isDashboard = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isDashboard(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals, static files, the MCP endpoint (bearer auth) and OAuth metadata.
    "/((?!_next|mcp|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
