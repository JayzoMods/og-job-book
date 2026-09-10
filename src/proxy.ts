import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authConfigured,
  isAuthEntryPath,
  isPublicTenantPath,
  SESSION_COOKIE,
} from "@/lib/ledger/auth";

export function proxy(request: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  const session = request.cookies.get(SESSION_COOKIE)?.value?.trim() ?? "";
  if (session !== "" && isAuthEntryPath(path)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isPublicTenantPath(path)) {
    return NextResponse.next();
  }
  if (session !== "") {
    return NextResponse.next();
  }
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "sign_in" }, { status: 401 });
  }
  const signIn = new URL("/sign-in", request.url);
  return NextResponse.redirect(signIn);
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
