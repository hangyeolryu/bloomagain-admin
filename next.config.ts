import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server mode: auth checked before sending dashboard (no static export)
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
