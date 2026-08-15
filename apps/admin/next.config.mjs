/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@certifine/ui', '@certifine/web-kit', '@certifine/api-client'],
};
export default nextConfig;
