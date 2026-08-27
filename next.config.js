const isDev = process.env.NODE_ENV === 'development';

// Worker del chat (fetch normal desde el cliente, ver src/components/ChatWidget.tsx).
// Se lee de la misma env var que el widget para que connect-src siga automaticamente
// a donde apunte NEXT_PUBLIC_AGENT_CHAT_URL en cada entorno, sin hardcodear el dominio.
const agentChatUrl = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';

// Sin nonces a proposito: el approach con nonce (ver node_modules/next/dist/docs/
// 01-app/02-guides/content-security-policy.md) obliga a renderizado dinamico en
// TODAS las paginas (no ISR/cache de CDN), lo cual es un costo alto para un storefront
// mayormente estatico. En su lugar seguimos el patron "Without Nonces" documentado ahi,
// que requiere 'unsafe-inline' en script-src/style-src para el bootstrap de Next/React
// y para los estilos inline generados en runtime. 'unsafe-eval' solo se habilita en
// dev (requerido por React para los stack traces), nunca en produccion.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://images.unsplash.com https://*.supabase.co https://*.tile.openstreetmap.org https://fal.media https://*.fal.media;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co${agentChatUrl ? ` ${agentChatUrl}` : ''};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, ' ')
  .trim();

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspHeader },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // geolocation=(self): el checkout usa navigator.geolocation.getCurrentPosition
  // en src/components/LocationPicker.tsx para autocompletar la ubicacion de delivery.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
