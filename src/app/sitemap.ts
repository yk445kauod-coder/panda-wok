import { MetadataRoute } from 'next';
import { DataService } from '@/lib/dataService';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://pandawok.eg';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/menu`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/feedback`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
    { url: `${baseUrl}/loyalty`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
  ];

  const categories = await DataService.getCategories();
  const categoryRoutes: MetadataRoute.Sitemap = categories.map(cat => ({
    url: `${baseUrl}/menu/${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8
  }));

  const items = await DataService.getMenuItems();
  const itemRoutes: MetadataRoute.Sitemap = items.map(item => ({
    url: `${baseUrl}/menu/item/${item.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.7
  }));

  return [...staticRoutes, ...categoryRoutes, ...itemRoutes];
}
