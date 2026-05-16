import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Authenticated — let the request through
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

export const config = {
  /*
   * Protect everything EXCEPT:
   *   /              — landing page
   *   /blog          — blog index
   *   /blog/*        — individual posts
   *   /auth/*        — login, signup, password recovery
   *   /_next/*       — Next.js internals
   *   /api/auth/*    — NextAuth API routes
   *   /favicon*, /*.png, /*.svg, /*.ico — static assets
   */
  matcher: [
    "/((?!$|blog(?:/.*)?|auth(?:/.*)?|_next(?:/.*)?|api/auth(?:/.*)?|favicon.*|.*\\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|ttf)).*)",
  ],
};
