/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'publications.rsamdio.org' },
      { protocol: 'https', hostname: 'pubhub.rsamdio.org' }
    ],
    qualities: [25, 50, 75, 85, 100]
  }
};

export default nextConfig;
