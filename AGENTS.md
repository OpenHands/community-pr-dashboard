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
- Production HTML includes the deployed git SHA in a comment near the top of the document, which is useful for checking whether Vercel is serving the latest commit.
- Bot accounts should be filtered out of reviewer-facing metrics, requested-reviewer lists, and the bottom PR table; author bot classification alone is not enough to remove bot-related rows from the dashboard.
