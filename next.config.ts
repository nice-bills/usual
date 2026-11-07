import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // The wallet moved to /app when / became the landing page. Old café QR links (/?request=…) still land in it.
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "request" }], destination: "/app", permanent: false }];
  },
};

export default nextConfig;
