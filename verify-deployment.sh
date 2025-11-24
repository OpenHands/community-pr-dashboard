#!/bin/bash
# Deployment Verification Script
# Use this to verify that production is showing the correct code from PR #14

echo "=== Vercel Deployment Verification for PR #14 ==="
echo ""
echo "This script checks if PR #14 changes are live in production"
echo ""

PRODUCTION_URL="${1:-https://your-production-url.vercel.app}"

echo "Testing production URL: $PRODUCTION_URL"
echo ""

# Test 1: Check if page loads
echo "Test 1: Checking if site loads..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Site loads successfully (HTTP $HTTP_CODE)"
else
    echo "❌ Site failed to load (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Check API Dashboard endpoint
echo "Test 2: Checking /api/dashboard endpoint..."
API_RESPONSE=$(curl -s "$PRODUCTION_URL/api/dashboard?limit=1")
if echo "$API_RESPONSE" | grep -q "kpis"; then
    echo "✅ API endpoint responds correctly"
    # Check if cache is working (should have cached response headers)
    CACHE_HEADER=$(curl -s -I "$PRODUCTION_URL/api/dashboard?limit=1" | grep -i "cache\|age")
    if [ -n "$CACHE_HEADER" ]; then
        echo "✅ Cache appears to be enabled"
        echo "   Cache info: $CACHE_HEADER"
    else
        echo "⚠️  No cache headers detected"
    fi
else
    echo "❌ API endpoint not responding correctly"
    echo "Response: $API_RESPONSE"
fi
echo ""

# Test 3: Check repositories endpoint with pagination
echo "Test 3: Checking /api/repositories endpoint..."
REPOS_RESPONSE=$(curl -s "$PRODUCTION_URL/api/repositories")
REPO_COUNT=$(echo "$REPOS_RESPONSE" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')
if [ -n "$REPO_COUNT" ] && [ "$REPO_COUNT" -gt 100 ]; then
    echo "✅ Repository pagination working (found $REPO_COUNT repos)"
    echo "   This confirms PR #14 pagination fix is live"
else
    echo "❌ Repository pagination may not be working (found $REPO_COUNT repos)"
    echo "   Expected: >100 repos if both orgs have many repositories"
fi
echo ""

# Test 4: Check build ID
echo "Test 4: Checking build ID..."
PAGE_SOURCE=$(curl -s "$PRODUCTION_URL")
BUILD_ID=$(echo "$PAGE_SOURCE" | grep -o '"buildId":"[^"]*"' | head -1)
if [ -n "$BUILD_ID" ]; then
    echo "✅ Build ID found: $BUILD_ID"
    echo "   Different build IDs indicate fresh builds"
else
    echo "⚠️  Could not extract build ID from page source"
fi
echo ""

# Test 5: Manual checks
echo "=== Manual Verification Steps ==="
echo ""
echo "Please verify these items manually in your browser:"
echo ""
echo "1. Open: $PRODUCTION_URL"
echo "2. Check that 'Age' filter defaults to 'All Time' (not 'Last 7 days')"
echo "3. Click 'Repository' dropdown - should show >100 repos from both orgs"
echo "4. Check browser DevTools Console for any errors"
echo "5. Click 'Refresh' button - should update data and show timestamp"
echo ""
echo "Expected PR #14 Changes:"
echo "  • Default age filter: 'All Time' (was '7-days')"
echo "  • Cache re-enabled in API"
echo "  • Repository pagination fetches ALL repos (was limited to 100/org)"
echo ""
echo "=== End of Verification ==="
