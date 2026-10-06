import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.20'],
  devIndicators: false,
  reactCompiler: true,
  async rewrites() {
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: 'https://tms.sjsangath.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
