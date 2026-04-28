import type { NextConfig } from "next";

/** App root for Turbopack when multiple lockfiles exist (avoid wrong workspace inference). Use cwd — not `__dirname`, which is undefined under ESM config evaluation. */
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
