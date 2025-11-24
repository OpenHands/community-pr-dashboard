/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use git commit SHA or timestamp for build ID to prevent stale cache issues
  generateBuildId: async () => {
    return process.env.VERCEL_GIT_COMMIT_SHA || `build-${Date.now()}`
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