import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends visitors without a session cookie to the login page. This only saves a
 * round trip: the session itself is checked on the server by requireUser().
 */
export function middleware(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
