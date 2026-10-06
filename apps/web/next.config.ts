import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@alarm-mcp/backend"],
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Link", value: '</llms.txt>; rel="describedby", </index.md>; rel="alternate"; type="text/markdown"' }],
      },
    ];
  },
};

export default nextConfig;
