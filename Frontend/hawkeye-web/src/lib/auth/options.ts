import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import crypto from "crypto";

// Server-side only: use HAWKEYE_BACKEND_URL (Docker internal hostname) when set,
// so the NextAuth jwt callback reaches the API within the Docker network.
// NEXT_PUBLIC_API_URL is baked at build time and points to localhost — unusable inside Docker.
const API_URL = (
  process.env.HAWKEYE_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000"
).replace(/\/$/, "");

function internalHmac(email: string, name: string): string {
  const secret = process.env.HAWKEYE_INTERNAL_SECRET ?? "";
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(`${email}:${name}`).digest("hex");
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return {
            id: data.id,
            email: data.email,
            name: data.name || null,
            image: null,
            access_token: data.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      // Credentials sign-in: propagate backend access_token from authorize()
      if (user?.access_token) {
        token.access_token = user.access_token;
      }
      // Remember the provider on first sign-in so we can retry on refresh
      if (account) {
        token.provider = account.provider;
      }
      // OAuth: exchange identity with backend — retry on every refresh until we succeed
      // (handles the case where the backend was temporarily down during first sign-in)
      if (token.provider !== "credentials" && token.email && !token.access_token) {
        const email = token.email ?? "";
        const name = (token.name ?? "") as string;
        try {
          const res = await fetch(`${API_URL}/api/auth/oauth-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": internalHmac(email, name),
            },
            body: JSON.stringify({ email, name }),
          });
          if (res.ok) {
            const data = await res.json();
            token.access_token = data.access_token;
          }
        } catch {
          // non-fatal — falls back to X-User-Email header on next request
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.access_token) {
        session.access_token = token.access_token;
      }
      return session;
    },
  },
};
