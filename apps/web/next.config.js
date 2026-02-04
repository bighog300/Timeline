if (!process.env.API_SERVER_ORIGIN && process.env.NODE_ENV === "production") {
  throw new Error("Missing API_SERVER_ORIGIN. Set it to the API origin for production rewrites.");
}

const apiOrigin = process.env.API_SERVER_ORIGIN ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@timeline/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
