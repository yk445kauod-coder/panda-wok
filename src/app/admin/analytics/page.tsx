'use client';

import React from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { BarChart2, TrendingUp, ShoppingBag, Users, DollarSign } from 'lucide-react';

export default function AdminAnalyticsPage() {
  const metrics = [
    { title: 'Revenue Today', value: '4,280 EGP', change: '+18.4%', icon: DollarSign },
    { title: 'Orders Today', value: '14 Orders', change: '+12.0%', icon: ShoppingBag },
    { title: 'Average Order Value', value: '305 EGP', change: '+5.2%', icon: TrendingUp },
    { title: 'New Customers', value: '6 Users', change: '+20.0%', icon: Users },
  ];

  const funnel = [
    { stage: 'Visitors (Home Page)', count: '1,240', pct: '100%' },
    { stage: 'Menu Viewers', count: '890', pct: '71.7%' },
    { stage: 'Dish Viewers', count: '540', pct: '43.5%' },
    { stage: 'Cart Users', count: '210', pct: '16.9%' },
    { stage: 'Checkout Completed', count: '128', pct: '10.3%' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Analytics & Funnel Performance</h1>
          <p className="text-xs text-brand-muted">Real-time revenue, conversion funnels & operational metrics.</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-brand-gold">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{m.title}</span>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-extrabold text-brand-paper">{m.value}</p>
                  <span className="text-xs font-bold text-green-400">{m.change}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversion Funnel */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold">
            Customer Conversion Funnel
          </h2>

          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-brand-paper">
                  <span>{f.stage}</span>
                  <span className="text-brand-gold">{f.count} ({f.pct})</span>
                </div>
                <div className="w-full bg-brand-dark rounded-full h-2.5 overflow-hidden border border-brand-border">
                  <div
                    className="bg-brand-accent h-2.5 rounded-full"
                    style={{ width: f.pct }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
