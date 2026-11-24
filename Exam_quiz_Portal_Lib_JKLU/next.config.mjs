const isDev = process.env.NODE_ENV === 'development';
const configuredApiUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  ''
)
  .trim()
  .replace(/\/+$/, '');

const connectSources = [
  "'self'",
  ...(isDev ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
  ...(configuredApiUrl ? [configuredApiUrl] : []),
  'https://paper-portal-588554backend-2nhi.vercel.app',
  'https://www.google.com/recaptcha/',
  'https://challenges.cloudflare.com',
  'https://accounts.google.com',
  'https://www.googleapis.com',
  'https://oauth2.googleapis.com',
  'https://vercel.live',
];

const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://challenges.cloudflare.com https://accounts.google.com/gsi/client https://va.vercel-scripts.com https://vercel.live`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src ${Array.from(new Set(connectSources)).join(' ')}`,
  "frame-src 'self' blob: https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://challenges.cloudflare.com https://accounts.google.com https://drive.google.com https://docs.google.com https://vercel.live",
  "worker-src 'self' blob:",
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
