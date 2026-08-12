const { i18n } = require('./next-i18next.config');

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  trailingSlash: true,
  reactStrictMode: true,
  compiler: {
    emotion: true,
  },
  i18n,
  // next-i18next resolves this config file and the locale JSON via dynamic
  // fs calls at request time, which Next's output file tracing can't see
  // statically — without this, serverless deploys (e.g. Vercel) omit them
  // from the function bundle and every page 500s.
  outputFileTracingIncludes: {
    '/**/*': ['./next-i18next.config.js', './public/locales/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
