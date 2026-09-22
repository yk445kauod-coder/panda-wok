'use client';

import React from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import Link from 'next/link';
import { UtensilsCrossed, Package, Users, BarChart2, Radio, Bot } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-brand-paper">Panda Wok Operating System</h1>
            <p className="text-xs text-brand-muted">Cloud kitchen operations hub in Alexandria, Egypt.</p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-400">Kitchen Live</span>
          </div>
        </div>

        {/* Quick Nav Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/orders"
            className="bg-brand-card border border-brand-border hover:border-brand-accent p-5 rounded-2xl transition-all space-y-2 group"
          >
            <UtensilsCrossed className="w-6 h-6 text-brand-accent group-hover:scale-110 transition-transform" />
            <h2 className="font-bold text-sm text-brand-paper">Kitchen Display & Orders</h2>
            <p className="text-xs text-brand-muted">View active tickets, kitchen preparation, and delivery timeline.</p>
          </Link>

          <Link
            href="/admin/menu"
            className="bg-brand-card border border-brand-border hover:border-brand-gold p-5 rounded-2xl transition-all space-y-2 group"
          >
            <Package className="w-6 h-6 text-brand-gold group-hover:scale-110 transition-transform" />
            <h2 className="font-bold text-sm text-brand-paper">Menu CMS Builder</h2>
            <p className="text-xs text-brand-muted">Add dishes, prices, transparent PNG assets, and category sorting.</p>
          </Link>

          <Link
            href="/admin/crm"
            className="bg-brand-card border border-brand-border hover:border-brand-accent p-5 rounded-2xl transition-all space-y-2 group"
          >
            <Users className="w-6 h-6 text-brand-accent group-hover:scale-110 transition-transform" />
            <h2 className="font-bold text-sm text-brand-paper">Cloud Kitchen CRM</h2>
            <p className="text-xs text-brand-muted">Analyze customer lifetime spending, order history, and activity logs.</p>
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
