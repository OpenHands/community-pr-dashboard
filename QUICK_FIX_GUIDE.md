# Quick Fix Guide - Stale Production Deployment

## TL;DR - What's Wrong

**Problem**: After merging PR #14, production on Vercel is still showing OLD code, even though:
- ✅ PR preview was up-to-date
- ✅ Code is merged to main (commit 24ed8ce)
- ✅ All changes exist in the repo

**Root Cause**: **Vercel's build cache** reused old `.next` artifacts instead of building fresh

## Why Preview Worked But Production Didn't

| Deployment Type | Build Cache Behavior | Result |
|----------------|---------------------|---------|
| **PR Preview** | Fresh build, isolated environment | ✅ Showed PR #14 changes |
| **Production** | Reused cached `.next` from before PR #14 | ❌ Shows old code |

Vercel treats preview deployments as independent builds but aggressively caches production builds for speed. When it couldn't detect "significant" changes, it served the cached build.

## Immediate Fix Options

### Option 1: Redeploy in Vercel Dashboard (5 minutes)

**EASIEST - Do this NOW:**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to "Deployments" tab
4. Find the latest production deployment
5. Click "..." menu → "Redeploy"
6. **IMPORTANT**: Uncheck "Use existing build cache" ✅
7. Click "Redeploy"
8. Wait for deployment to complete
9. Verify production site shows PR #14 changes

**Expected results after redeploying:**
- Age filter defaults to "All Time" (not "Last 7 days")
- Repository selector shows ALL repos (>100)
- API caching is re-enabled

### Option 2: Push This Fix Commit (10 minutes)

**BETTER - Prevents future issues:**

```bash
# Push the commit that was just created
git push origin main
```

This commit includes:
- ✅ `vercel.json` - Forces clean builds by removing `.next`
- ✅ `next.config.js` - Uses commit SHA for unique build IDs
- ✅ Documentation and verification script

After pushing, Vercel will automatically deploy with a **fresh build**.

### Option 3: Manual Vercel CLI Deploy (Advanced)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production with no cache
vercel --prod --force
```

## Verification Checklist

After applying the fix, verify these items:

### Quick Visual Check
1. Open production URL
2. Look at "Age" filter → Should say "All Time" (not "Last 7 days")
3. Open "Repository" dropdown → Should show many repos (>100 if orgs have that many)

### API Check
```bash
# Run verification script
./verify-deployment.sh https://your-production-url.vercel.app
```

### Browser DevTools Check
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Check `/api/dashboard` request
5. Look for cache-related headers

## What PR #14 Changed (Should Be Live)

| File | Change | Impact |
|------|--------|--------|
| `app/page.tsx` | Default age filter: `'all'` (was `'7-days'`) | Shows ALL PRs by default |
| `app/api/dashboard/route.ts` | Re-enabled `cache.withCache()` | Faster API responses |
| `app/api/repositories/route.ts` | Added pagination loop | Fetches ALL repos, not just 100 |

## What This Fix Does

### Files Added/Modified

1. **`vercel.json`** (NEW)
   - Forces removal of `.next` directory before build
   - Uses `npm ci` instead of `npm install`
   - Ensures clean builds every time

2. **`next.config.js`** (MODIFIED)
   - Added `generateBuildId` using git commit SHA
   - Each commit gets unique build ID
   - Prevents cache collisions

3. **`VERCEL_STALE_DEPLOYMENT_ISSUE.md`** (NEW)
   - Full root cause analysis
   - Detailed explanation of the problem
   - Multiple solution approaches

4. **`verify-deployment.sh`** (NEW)
   - Automated verification script
   - Tests API endpoints
   - Checks build IDs

## Prevention

With the new `vercel.json` and `next.config.js`, this won't happen again because:

1. Every build clears `.next` directory first
2. Each build gets unique ID from git commit SHA
3. Vercel can't reuse stale cached builds

## Still Having Issues?

If production is still stale after redeploying:

1. **Check Vercel build logs**:
   - Look for "Using cached build" messages
   - Verify `.next` was removed
   - Check if environment variables are set

2. **Check git commit**:
   ```bash
   git log --oneline -5
   # Should show commit 30a044d with "Fix Vercel stale build cache"
   ```

3. **Force rebuild via Vercel settings**:
   - Project Settings → Git
   - Disconnect and reconnect repository
   - Trigger new deployment

4. **Check Vercel production branch**:
   - Verify production is tracking `main` branch
   - Not tracking a different branch or tag

## Need Help?

See `VERCEL_STALE_DEPLOYMENT_ISSUE.md` for:
- Detailed technical analysis
- Alternative solutions
- Troubleshooting steps
- Prevention strategies

---

**Created**: 2025-11-24  
**Issue**: Vercel build cache causing stale deployments  
**Status**: ✅ Fix committed and ready to deploy  
**Commit**: 30a044d
