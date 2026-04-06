import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] }
  },
  turbopack: {
    root: '/Users/deon/agentos/app'
  }
}

export default nextConfig
