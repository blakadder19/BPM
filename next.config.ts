import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Receipt PDFs read the bundled font and logo from disk at request time.
  outputFileTracingIncludes: {
    "/api/receipts/**": ["./lib/assets/receipt/**"],
    "/receipt/**": ["./lib/assets/receipt/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
