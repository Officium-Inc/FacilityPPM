/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone' is only for Docker/self-hosted. Remove for Vercel.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
