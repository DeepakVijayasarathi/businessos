/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    // next/image isn't used anywhere in this app yet (images are plain
    // <img> tags served from /uploads) — no remotePatterns needed until
    // that changes. A bare '**' wildcard here would let the Image
    // Optimization API fetch/proxy from any https host.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
