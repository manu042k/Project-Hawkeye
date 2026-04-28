import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protect `/app` routes without `next-auth/middleware`'s default handler. That
 * handler calls `parseUrl(process.env.NEXTAUTH_URL)`; an empty string makes
 * `new URL("")` throw on the Edge runtime and yields MIDDLEWARE_INVOCATION_FAILED
 * on Vercel. JWT `getToken` does not rely on NEXTAUTH_URL for path parsing.
 */
export async function middleware(request: NextRequest) {
  const secret =
    process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";

  if (!secret) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/error";
    url.searchParams.set("error", "Configuration");
    return NextResponse.redirect(url);
  }

  const token = await getToken({ req: request, secret });

  if (!token) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/auth/login";
    signIn.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
