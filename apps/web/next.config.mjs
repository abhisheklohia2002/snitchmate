// Keep browser calls same-origin so OTP session cookies work on Render.
// Render sets API_INTERNAL_HOSTPORT from the NestJS service's private host:port.
// The app still builds and runs locally without an internal API target.
export default {
  poweredByHeader: false,
  async rewrites() {
    const hostport = process.env.API_INTERNAL_HOSTPORT;
    if (!hostport) return [];
    return [{source: '/api/v1/:path*', destination: `http://${hostport}/api/v1/:path*`}];
  },
};
