import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { clerkAuthConfigured, isPublicTenantPath } from "@/lib/ledger/auth";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!clerkAuthConfigured()) {
    return NextResponse.next();
  }
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  const run = clerkMiddleware(async (auth, req) => {
    if (isPublicTenantPath(req.nextUrl.pathname)) {
      return;
    }
    await auth.protect();
  });
  return run(request, event);
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
