# Hawkeye — Frontend

Next.js 16 dashboard for the Hawkeye AI testing platform.

## Setup

```bash
cp .env.example .env.local
# Fill in NEXTAUTH_SECRET, HAWKEYE_INTERNAL_SECRET, OAuth credentials, and NEXT_PUBLIC_API_URL
npm install
npm run dev      # http://localhost:3000
```

Requires the backend API to be running at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).  
See the [root README](../../README.md) for full setup instructions.

## Commands

```bash
npm run dev       # Development server with hot reload
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check
```

## Structure

```
src/
├── app/
│   ├── auth/              # Login, signup, OAuth callback
│   ├── app/(global-hub)/  # Project selector, account, billing
│   └── app/(workspace)/   # Dashboard, runs, suites, vault, settings
├── components/
│   ├── app/               # AppTopbar, UnifiedSidebar, nav items
│   └── ui/                # shadcn/ui primitives
└── lib/
    ├── api/               # Typed API client (client.ts) + React hooks (hooks.ts)
    ├── project/           # Per-user project store (Zustand + persist)
    └── notifications/     # Per-user notification store (Zustand + persist)
```
