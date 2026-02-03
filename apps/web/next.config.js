const apiOrigin = process.env.API_SERVER_ORIGIN ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
