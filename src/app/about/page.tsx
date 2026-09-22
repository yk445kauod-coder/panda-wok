import React from 'react';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { Flame, Sparkles, HeartHandshake } from 'lucide-react';

export default async function AboutPage() {
  const settings = await DataService.getRestaurantSettings();

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="bg-rice-pattern bg-brand-card border border-brand-border rounded-3xl p-6 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-brand-accent flex items-center justify-center font-extrabold text-3xl mx-auto shadow-lg shadow-brand-accent/30">
            🐼
          </div>
          <h1 className="text-2xl font-extrabold text-brand-paper">The Panda Wok Story</h1>
          <p className="text-xs text-brand-gold font-medium">{settings.tagline} • Alexandria, Egypt</p>
        </div>

        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-3 text-xs leading-relaxed text-brand-muted">
          <h2 className="text-sm font-bold text-brand-paper flex items-center space-x-1.5">
            <Flame className="w-4 h-4 text-brand-accent" />
            <span>High-Heat Wok Tradition</span>
          </h2>
          <p>
            Founded in Alexandria, Panda Wok combines centuries-old wok hei techniques with modern cloud-kitchen efficiency.
          </p>
          <p>
            From slow-simmered Japanese Ramen broths to hand-rolled fresh artisanal sushi and smoky wok noodles, every dish is prepared on demand.
          </p>
        </div>
      </div>
    </div>
  );
}
