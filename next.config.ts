import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB — too small for the plantpro Import Wizard's timecard
    // PDF (one page per worker) and worker-details Excel uploads.
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
