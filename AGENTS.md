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
- If a branch is first reviewed on the fork, the final handoff should close the fork PR and open an upstream PR from the same fork branch, with the fork PR left closed and linked to the upstream PR for traceability.
- PR author badges use `config/maintainers.json` as the maintainer source of truth, with repo collaborators still derived from the GitHub collaborators API in `buildRepoAuthorRoleSets` / `getRepoCollaboratorsREST`.
- Bot accounts should be filtered out of reviewer-facing metrics and requested-reviewer lists; author bot classification alone is not enough to remove bot reviewers from the dashboard.
- Production HTML includes the deployed git SHA in a comment near the top of the document, which is useful for checking whether Vercel is serving the latest commit.
- `__tests__/api/dashboard.test.ts` may need a larger Node heap in this environment; `NODE_OPTIONS=--max-old-space-size=8192 npm test -- --runInBand __tests__/api/dashboard.test.ts` worked reliably.
