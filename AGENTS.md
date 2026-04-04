# Community PR Dashboard — Agent Guide

## Project Overview
Next.js 16 + TypeScript dashboard for monitoring community pull requests via the GitHub API.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS
- **Testing**: Jest + Testing Library
- **Linting**: ESLint 8

## Key Commands
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # Run ESLint on all .ts/.tsx files
npm run lint:fix     # Auto-fix ESLint issues
npm run test         # Run Jest tests
npm run test:watch   # Run Jest in watch mode
```

## Notes
- `next lint` does not exist in Next.js 16 — use `npm run lint` instead.
- Path alias `@/` maps to the project root.
- `app/page_old.tsx` is a legacy file with known lint warnings.
- The active working fork is `enyst/oh-community-pr-dashboard`; upstream is `OpenHands/community-pr-dashboard`.
- PR author badges now distinguish repo maintainers (`maintain`/`admin`) from write-only collaborators by deriving repo author role sets from the GitHub collaborators API in `buildRepoAuthorRoleSets` / `getRepoAuthorRoleSetsREST`.
- `__tests__/api/dashboard.test.ts` may need a larger Node heap in this environment; `NODE_OPTIONS=--max-old-space-size=8192 npm test -- --runInBand __tests__/api/dashboard.test.ts` worked reliably.
