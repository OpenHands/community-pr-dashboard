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

## Linter Setup
- **Config**: `.eslintrc.json` (created at repo root)
- **Extends**: `next/core-web-vitals` + `plugin:@typescript-eslint/recommended`
- **Parser**: `@typescript-eslint/parser`
- **Key rules**:
  - `@typescript-eslint/no-unused-vars`: error (args prefixed with `_` are exempt)
  - `@typescript-eslint/no-explicit-any`: warn
- **Note**: Next.js 16 dropped the `next lint` CLI command; the `lint` script uses `eslint` directly.

## Important Notes
- `next lint` does **not** exist in Next.js 16 — use `npm run lint` instead.
- Path alias `@/` maps to the project root (configured in `tsconfig.json`).
- The `eslint-config-next` version (14.x) is intentionally pinned below the Next.js version.
- `app/page_old.tsx` is a legacy file and may have known lint warnings.
