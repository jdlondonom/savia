import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security-headers';

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: securityHeaders().map(([key, value]) => ({ key, value })),
    }];
  },
};

export default nextConfig;
