import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  TRIAL_DEVICE_COOKIE,
  TRIAL_DEVICE_MAX_MS,
  authConfigured,
  isAuthEntryPath,
  isPublicTenantPath,
  newTrialDeviceToken,
  parseTrialDeviceToken,
} from "@/lib/ledger/auth";

function withTrialDeviceCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  if (parseTrialDeviceToken(request.cookies.get(TRIAL_DEVICE_COOKIE)?.value)) {
    return response;
  }
  response.cookies.set(TRIAL_DEVICE_COOKIE, newTrialDeviceToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TRIAL_DEVICE_MAX_MS / 1000),
  });
  return response;
}

export function proxy(request: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  const session = request.cookies.get(SESSION_COOKIE)?.value?.trim() ?? "";
  if (session !== "" && isAuthEntryPath(path)) {
    return withTrialDeviceCookie(
      request,
      NextResponse.redirect(new URL("/", request.url)),
    );
  }
  if (isPublicTenantPath(path)) {
    return withTrialDeviceCookie(request, NextResponse.next());
  }
  if (session !== "") {
    return withTrialDeviceCookie(request, NextResponse.next());
  }
  if (path.startsWith("/api/")) {
    return withTrialDeviceCookie(
      request,
      NextResponse.json({ error: "sign_in" }, { status: 401 }),
    );
  }
  const signIn = new URL("/sign-in", request.url);
  return withTrialDeviceCookie(request, NextResponse.redirect(signIn));
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
