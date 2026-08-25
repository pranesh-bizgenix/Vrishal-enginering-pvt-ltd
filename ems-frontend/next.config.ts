import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.1.20'],
  devIndicators: false,
  reactCompiler: true,
};

export default nextConfig;
