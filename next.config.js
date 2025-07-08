/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  // Ensure API routes timeout properly
  experimental: {
    serverComponentsExternalPackages: []
  }
}

module.exports = nextConfig
