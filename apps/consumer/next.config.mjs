/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@certifine/ui', '@certifine/web-kit', '@authentik/api-client'],
  experimental: {
    typedRoutes: true,
    // Next 14: allow useSearchParams() without Suspense (pre-existing client pages).
    // Without this, production prerender fails with "missing-suspense-with-csr-bailout".
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;
