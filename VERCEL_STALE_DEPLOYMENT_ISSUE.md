# Vercel Stale Deployment Issue - Root Cause Analysis

## Problem Summary
After merging PR #14 into main, the Vercel production deployment is still serving stale code, even though:
- The PR preview deployment showed the updated code correctly
- The main branch contains the merged changes (commit 24ed8ce)
- All changes are present in the repository

## Root Cause Analysis

### Why PR Preview Was Up-to-Date But Production Is Stale

**The issue is Vercel's Build Cache System:**

1. **Preview Deployments (PR #14)**:
   - Vercel treats preview deployments as fresh builds
   - Preview builds often bypass certain caching optimizations
   - Each PR gets its own isolated build environment
   - Preview showed the correct updated code

2. **Production Deployment (After Merge)**:
   - Vercel uses aggressive caching for production builds
   - When code is merged, Vercel may reuse cached build artifacts
   - If Vercel determines "nothing significant changed", it serves cached builds
   - This results in production serving the OLD code despite the merge

### Changes in PR #14 That Should Be Live

The following changes from PR #14 are NOT showing in production:

1. **app/page.tsx**:
   - Default `ageRange` should be `'all'` (was `'7-days'`)
   - This change affects what PRs are shown by default

2. **app/api/dashboard/route.ts**:
   - Cache should be re-enabled with `cache.withCache()`
   - Previously was bypassed for debugging

3. **app/api/repositories/route.ts**:
   - Repository pagination should loop through ALL pages
   - Previously only fetched first 100 repos per org

## Why This Happens

Vercel uses several caching mechanisms:

1. **Build Output Cache**: Next.js `.next` directory
2. **Dependency Cache**: `node_modules`
3. **Build Function Cache**: Compiled API routes
4. **Static Asset Cache**: Images, fonts, etc.

When you merge PR #14, Vercel might:
- Detect no changes to `package.json` → Reuse dependency cache ✓
- Detect no changes to static assets → Reuse asset cache ✓
- **Incorrectly reuse build output cache** → PROBLEM ✗

## Solutions (in order of preference)

### Solution 1: Force Vercel to Rebuild (Immediate Fix)

In Vercel Dashboard:
1. Go to your project
2. Navigate to the latest deployment
3. Click "Redeploy" button
4. **Important**: Check "Use existing build cache" and set it to **OFF/Disabled**
5. This forces a complete fresh build

### Solution 2: Add vercel.json Configuration (Permanent Fix)

Create a `vercel.json` file to control caching behavior:

```json
{
  "buildCommand": "rm -rf .next && next build",
  "framework": "nextjs",
  "installCommand": "npm install",
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ]
}
```

This ensures `.next` directory is cleared before each build.

### Solution 3: Modify next.config.js (Alternative)

Add cache-busting configuration:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force fresh builds
  generateBuildId: async () => {
    // Use git commit hash or timestamp
    return process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString()
  },
  env: {
    CUSTOM_KEY: 'my-value',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

### Solution 4: Dummy Commit (Quick Workaround)

Create a small change to trigger fresh build:

```bash
# Add a comment or whitespace to trigger rebuild
echo "\n// Force rebuild $(date)" >> next.config.js
git add next.config.js
git commit -m "Force Vercel rebuild - clear stale cache"
git push origin main
```

### Solution 5: Vercel CLI Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy with no cache
vercel --prod --force
```

## Verification Steps

After applying any solution, verify the fix:

1. **Check Default Filter**:
   - Open production URL
   - Check if "Age" filter shows "All Time" (not "Last 7 days")

2. **Check Cache Status**:
   - Open browser DevTools → Network tab
   - Call `/api/dashboard`
   - Check if caching headers are present

3. **Check Repository Count**:
   - Open production URL
   - Select "Repository" dropdown
   - Should show ALL repos from both orgs (more than 100)

4. **Verify Build ID**:
   - View page source
   - Look for `buildId` in Next.js data
   - Should be different from previous deployment

## Prevention

To prevent this issue in the future:

1. **Add vercel.json** with proper build configuration
2. **Use Vercel CLI** for critical deployments
3. **Enable deployment protection** and manually approve production deploys
4. **Monitor build logs** for cache reuse warnings
5. **Test production immediately** after merges

## Current Repository State

✅ Main branch is at correct commit: `24ed8ce`
✅ All PR #14 changes are present in code
✅ No build artifacts committed to git
✅ `.gitignore` properly excludes `.next/` and build files

❌ Production deployment is serving cached/stale build
❌ Missing `vercel.json` to control build behavior

## Recommended Immediate Action

1. Go to Vercel Dashboard
2. Find the production deployment
3. Click "Redeploy" with cache disabled
4. Verify the deployment shows updated code
5. Add `vercel.json` to prevent future occurrences

---

**Last Updated**: 2025-11-24
**Issue**: Vercel build cache causing stale production deployment
**Status**: Identified - Awaiting fix deployment
