/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@authentik/ui', '@authentik/utils', '@authentik/api-client'],
};
export default nextConfig;
