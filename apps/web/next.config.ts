import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The language comes from each request's Accept-Language header and most pages
// show per-user, live seat data, so pages render on demand instead of using Cache Components.
const nextConfig: NextConfig = {
  transpilePackages: ["@sinema/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
