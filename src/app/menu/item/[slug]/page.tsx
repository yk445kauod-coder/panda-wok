import React from 'react';
import { notFound } from 'next/navigation';
import { DataService } from '@/lib/dataService';
import { generateMenuItemJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo';
import { NavigationBar } from '@/components/NavigationBar';
import { DishDetailsClient } from '@/components/DishDetailsClient';

interface Props {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: Props) {
  const item = await DataService.getMenuItemBySlug(params.slug);
  if (!item) return {};

  return {
    title: `${item.name_en} | Panda Wok Alexandria`,
    description: item.description_en,
    openGraph: {
      title: item.name_en,
      description: item.description_en,
      images: [{ url: item.image_url }],
    },
  };
}

export default async function DishDetailPage({ params }: Props) {
  const item = await DataService.getMenuItemBySlug(params.slug);
  if (!item) notFound();

  const jsonLd = generateMenuItemJsonLd(item);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', item: '/' },
    { name: 'Menu', item: '/menu' },
    { name: item.name_en, item: `/menu/item/${item.slug}` },
  ]);

  return (
    <div className="min-h-screen bg-brand-dark pb-24 text-brand-paper px-4 pt-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <NavigationBar />
      <DishDetailsClient item={item} />
    </div>
  );
}
