import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Raw phone videos can be tens of MB — default 1MB server action limit
  // is far too small for the property intake form's video upload.
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
    },
  },
};

export default nextConfig;
