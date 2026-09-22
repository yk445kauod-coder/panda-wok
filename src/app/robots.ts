import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/checkout', '/order/'],
      },
    ],
    sitemap: 'https://pandawok.eg/sitemap.xml',
  };
}
