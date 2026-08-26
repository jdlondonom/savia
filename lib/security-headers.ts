export function securityHeaders(development = process.env.NODE_ENV !== 'production') {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://challenges.cloudflare.com${development ? ' ws: wss:' : ''}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
  ].join('; ');

  return [
    ['Content-Security-Policy', contentSecurityPolicy],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ...(development
      ? []
      : [['Strict-Transport-Security', 'max-age=31536000; includeSubDomains']]),
  ] as const;
}
