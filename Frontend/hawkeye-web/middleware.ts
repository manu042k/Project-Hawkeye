export { default } from "next-auth/middleware";

export const config = {
  // Include `/app` (project selector) and all nested routes.
  matcher: ["/app", "/app/:path*"],
};

