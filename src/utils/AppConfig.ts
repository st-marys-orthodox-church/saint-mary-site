// Non-display configuration. All user-facing copy (site name, titles, descriptions,

import { SOCIALS } from './Constants';

// OG alt text, meta descriptions) lives in public/locales/{locale}/seo.json.

// Resolved at build time so OG images, canonicals, and JSON-LD point at the domain actually
// serving this build rather than the legacy events.saintmaryro.org site.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://events.saintmaryro.org');

export const AppConfig = {
  defaultLocale: 'en',
  url: SITE_URL,
  logo: `${SITE_URL}/logos/saintmaryrologo.png`,
  ogImage: `${SITE_URL}/og-image.jpg`,
  themeColor: '#7c9885',
  instagram: SOCIALS.IG,
  twitter: '',
  facebook: SOCIALS.FB,
  googleBusinessProfile: 'https://maps.app.goo.gl/XMYyAKG9XSL24X259',
  telephone: '+1-404-518-1042',
  email: 'events@saintmaryro.org',
  address: {
    street: '2875 Winder Hwy',
    city: 'Dacula',
    region: 'GA',
    postalCode: '30019',
    country: 'US',
  },
  geo: {
    latitude: 33.99224442833723,
    longitude: -83.88655118493534,
  },
  priceRange: '$2000-$4000',
};
