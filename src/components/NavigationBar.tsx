'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Utensils, ShoppingBag, Flame, User, Heart, Compass } from 'lucide-react';

export function NavigationBar() {
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState<number>(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const raw = localStorage.getItem('pandawok_cart');
        if (raw) {
          const items = JSON.parse(raw);
          const total = items.reduce((acc: number, item: { quantity: number }) => acc + item.quantity, 0);
          setCartCount(total);
        } else {
          setCartCount(0);
        }
      } catch (e) {
        setCartCount(0);
      }
    };

    updateCount();
    window.addEventListener('storage', updateCount);
    window.addEventListener('cart-updated', updateCount);
    return () => {
      window.removeEventListener('storage', updateCount);
      window.removeEventListener('cart-updated', updateCount);
    };
  }, []);

  const navItems = [
    { name: 'Home', href: '/', icon: Compass },
    { name: 'Menu', href: '/menu', icon: Utensils },
    { name: 'Loyalty', href: '/loyalty', icon: Flame },
    { name: 'Account', href: '/account', icon: User },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-brand-dark/90 backdrop-blur-md border-b border-brand-border px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-brand-accent flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-brand-accent/30">
            🐼
          </div>
          <div>
            <span className="font-extrabold tracking-wider text-lg text-brand-paper">PANDA WOK</span>
            <span className="block text-[10px] text-brand-gold tracking-widest uppercase font-medium">Alexandria</span>
          </div>
        </Link>

        <div className="flex items-center space-x-3">
          <Link
            href="/cart"
            className="relative p-2.5 rounded-full bg-brand-card hover:bg-brand-border text-brand-paper transition-all border border-brand-border"
            aria-label="View Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-accent text-white font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-pulse">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Bottom Thumb Navigation Bar (Mobile First) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-brand-dark/95 backdrop-blur-md border-t border-brand-border py-2 px-6 flex justify-around items-center md:max-w-md md:mx-auto md:rounded-t-2xl shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center space-y-1 text-xs font-medium transition-colors ${
                isActive ? 'text-brand-accent font-bold scale-105' : 'text-brand-muted hover:text-brand-paper'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
