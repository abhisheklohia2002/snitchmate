// Proxy browser API calls through the Next.js origin so HTTP-only session cookies
// remain first-party. Render Free services cannot receive private-network traffic:
// use the API's public HTTPS URL, not its private hostport.
export default {
  poweredByHeader: false,
  async rewrites() {
    const origin = process.env.STITCHMATE_API_PUBLIC_ORIGIN?.replace(/\/$/, '');
    if (!origin) return []; // Local development continues using its own API configuration.
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('STITCHMATE_API_PUBLIC_ORIGIN must be an HTTPS origin');
    }
    return [
      {
        source: '/api/v1/:path*',
        destination: `${origin}/api/v1/:path*`,
      },
    ];
  },
};
