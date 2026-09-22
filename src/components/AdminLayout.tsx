'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Package,
  Layers,
  Users,
  Flame,
  MessageSquare,
  Radio,
  Bot,
  BarChart2,
  Download,
  Database,
  Settings,
  ChevronRight
} from 'lucide-react';

const ADMIN_NAV = [
  { name: 'Dashboard Overview', href: '/admin', icon: LayoutDashboard },
  { name: 'Orders & KDS', href: '/admin/orders', icon: UtensilsCrossed },
  { name: 'Menu CMS', href: '/admin/menu', icon: Package },
  { name: 'Stock Management', href: '/admin/stock', icon: Layers },
  { name: 'CRM & Customers', href: '/admin/crm', icon: Users },
  { name: 'Loyalty Rules', href: '/admin/loyalty', icon: Flame },
  { name: 'Broadcast System', href: '/admin/broadcast', icon: Radio },
  { name: 'Live Chat', href: '/admin/chat', icon: MessageSquare },
  { name: 'AI Center', href: '/admin/ai', icon: Bot },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart2 },
  { name: 'Exports & Backups', href: '/admin/exports', icon: Download },
  { name: 'Module Flags', href: '/admin/settings', icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-brand-dark text-brand-paper flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-brand-card border-r border-brand-border flex-shrink-0 p-4 space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-brand-border">
          <div className="w-10 h-10 rounded-xl bg-brand-accent flex items-center justify-center text-xl font-bold">
            🐼
          </div>
          <div>
            <h2 className="font-extrabold text-brand-paper text-sm tracking-wider">PANDA OS</h2>
            <span className="text-[10px] text-brand-gold font-semibold uppercase tracking-widest block">Kitchen Operations</span>
          </div>
        </div>

        <nav className="space-y-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-brand-accent text-white shadow-md'
                    : 'text-brand-muted hover:text-brand-paper hover:bg-brand-border'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
