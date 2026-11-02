/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are enabled by default in Next 14.
  },
  images: {
    remotePatterns: [
      // Supabase Storage public buckets (set your project ref in NEXT_PUBLIC_SUPABASE_URL)
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
