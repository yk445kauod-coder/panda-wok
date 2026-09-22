import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { generateRestaurantJsonLd } from '@/lib/seo';
import { Utensils, Flame, Sparkles, Clock, MapPin, ChevronRight, Star } from 'lucide-react';

export default async function HomePage() {
  const categories = await DataService.getCategories();
  const items = await DataService.getMenuItems();
  const settings = await DataService.getRestaurantSettings();
  const featuredItems = items.filter(i => i.is_featured);

  const jsonLd = generateRestaurantJsonLd(settings);

  return (
    <div className="min-h-screen bg-brand-dark pb-24 text-brand-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <NavigationBar />

      {/* Hero Section */}
      <section className="relative px-4 pt-6 pb-8 text-center bg-rice-pattern border-b border-brand-border">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-semibold mb-3 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Authentic Cloud Kitchen • Alexandria</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-paper leading-tight mb-2">
          Flame-Seared <span className="text-brand-accent">Asian Wok</span> & Craft Ramen
        </h1>

        <p className="text-brand-muted text-sm max-w-sm mx-auto mb-6">
          Handcrafted Asian culinary experience delivered hot to your doorstep in Kafr Abdo & across Alexandria.
        </p>

        <div className="flex justify-center items-center gap-3">
          <Link
            href="/menu"
            className="flex-1 max-w-[160px] py-3 px-4 bg-brand-accent hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-brand-accent/20 flex items-center justify-center space-x-2 transition-transform active:scale-95"
          >
            <Utensils className="w-4 h-4" />
            <span>Explore Menu</span>
          </Link>
          <Link
            href="/loyalty"
            className="py-3 px-4 bg-brand-card hover:bg-brand-border text-brand-gold border border-brand-gold/30 font-bold text-sm rounded-xl flex items-center justify-center space-x-1 transition-transform active:scale-95"
          >
            <Flame className="w-4 h-4" />
            <span>Rewards</span>
          </Link>
        </div>

        {/* Quick Highlights */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] text-brand-muted border-t border-brand-border/60 pt-4 max-w-sm mx-auto">
          <div className="flex flex-col items-center">
            <Clock className="w-4 h-4 text-brand-gold mb-1" />
            <span>30-45 Mins</span>
          </div>
          <div className="flex flex-col items-center">
            <MapPin className="w-4 h-4 text-brand-accent mb-1" />
            <span>Alexandria</span>
          </div>
          <div className="flex flex-col items-center">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 mb-1" />
            <span>4.9 / 5.0</span>
          </div>
        </div>
      </section>

      {/* Categories Horizontal Scroll */}
      <section className="py-6 px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-brand-paper tracking-wide">Categories</h2>
          <Link href="/menu" className="text-xs text-brand-gold flex items-center hover:underline">
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/menu/${cat.slug}`}
              className="flex-none bg-brand-card hover:bg-brand-border border border-brand-border px-4 py-3 rounded-2xl flex items-center space-x-2 transition-all active:scale-95"
            >
              <div className="w-2 h-2 rounded-full bg-brand-accent" />
              <div className="text-left">
                <p className="text-xs font-bold text-brand-paper">{cat.name_en}</p>
                <p className="text-[10px] text-brand-muted">{cat.name_ar}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Chef Specials */}
      <section className="px-4 py-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-paper tracking-wide flex items-center space-x-2">
            <Flame className="w-5 h-5 text-brand-accent" />
            <span>Chef's Featured Specials</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {featuredItems.map((item) => (
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
                {item.transparent_png && (
                  <span className="absolute top-2 right-2 bg-brand-dark/80 backdrop-blur-md text-brand-gold text-[10px] px-2 py-0.5 rounded-full border border-brand-gold/40">
                    Transparent Assets Enabled
                  </span>
                )}
                {item.is_spicy && (
                  <span className="absolute top-2 left-2 bg-red-950/90 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-800">
                    🌶️ Spicy
                  </span>
                )}
              </div>

              <div className="p-4 flex flex-col justify-between flex-1">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-brand-paper">{item.name_en}</h3>
                    {item.name_jp && (
                      <span className="text-xs text-brand-gold font-serif">{item.name_jp}</span>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-1 line-clamp-2">{item.description_en}</p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-base font-extrabold text-brand-paper">{item.price} EGP</span>
                  <span className="text-xs font-bold bg-brand-accent text-white px-3 py-1.5 rounded-xl shadow-md group-hover:bg-red-700 transition-colors">
                    Order Now
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
