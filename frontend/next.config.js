/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
