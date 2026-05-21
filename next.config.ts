import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig
