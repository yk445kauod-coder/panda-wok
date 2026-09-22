import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { generateMenuJsonLd } from '@/lib/seo';
import { Flame, Leaf } from 'lucide-react';

interface Props {
  params?: {
    category?: string;
  };
}

export default async function MenuPage({ params }: Props) {
  const categorySlug = params?.category;
  const categories = await DataService.getCategories();
  let allItems = await DataService.getMenuItems();

  if (categorySlug) {
    const selectedCat = categories.find(c => c.slug === categorySlug);
    if (selectedCat) {
      allItems = allItems.filter(i => i.category_id === selectedCat.id);
    }
  }

  const jsonLd = generateMenuJsonLd(categories, allItems);

  return (
    <div className="min-h-screen bg-brand-dark pb-24 text-brand-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <NavigationBar />

      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-brand-border bg-rice-pattern">
        <h1 className="text-2xl font-extrabold tracking-wide text-brand-paper">
          Panda Wok <span className="text-brand-accent">Menu</span>
        </h1>
        <p className="text-xs text-brand-muted mt-1">
          Authentic flame-seared Asian culinary selection in Alexandria.
        </p>

        {/* Category Tabs */}
        <div className="flex space-x-2 overflow-x-auto mt-4 pb-2 scrollbar-none">
          <Link
            href="/menu"
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              !categorySlug
                ? 'bg-brand-accent text-white shadow-md'
                : 'bg-brand-card text-brand-muted border border-brand-border hover:text-brand-paper'
            }`}
          >
            All Items
          </Link>
          {categories.map((cat) => {
            const isActive = categorySlug === cat.slug;
            return (
              <Link
                key={cat.id}
                href={`/menu/${cat.slug}`}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-accent text-white shadow-md'
                    : 'bg-brand-card text-brand-muted border border-brand-border hover:text-brand-paper'
                }`}
              >
                {cat.name_en}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Menu Item Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allItems.map((item) => (
          <Link
            key={item.id}
            href={`/menu/item/${item.slug}`}
            className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/50 transition-all flex flex-col group"
          >
            <div className="relative h-44 w-full bg-zinc-900">
              <Image
                src={item.image_url}
                alt={item.name_en}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2 left-2 flex gap-1">
                {item.is_spicy && (
                  <span className="bg-red-950/90 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-800 flex items-center space-x-1">
                    <Flame className="w-3 h-3 inline" />
                    <span>Spicy</span>
                  </span>
                )}
                {item.is_vegetarian && (
                  <span className="bg-green-950/90 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-800 flex items-center space-x-1">
                    <Leaf className="w-3 h-3 inline" />
                    <span>Veggie</span>
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-base text-brand-paper">{item.name_en}</h2>
                  {item.name_jp && (
                    <span className="text-xs text-brand-gold font-serif">{item.name_jp}</span>
                  )}
                </div>
                <p className="text-xs text-brand-muted mt-1 line-clamp-2">{item.description_en}</p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-base font-extrabold text-brand-paper">{item.price} EGP</span>
                <span className="text-xs font-bold bg-brand-border text-brand-paper group-hover:bg-brand-accent group-hover:text-white px-3 py-1.5 rounded-xl transition-colors">
                  View Dish
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
