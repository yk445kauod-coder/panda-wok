'use client';

import React, { useState } from 'react';
import { MenuItem } from '@/lib/types';
import { ShoppingBag, Flame, Leaf, Check, Plus, Minus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export function DishDetailsClient({ item }: { item: MenuItem }) {
  const [quantity, setQuantity] = useState<number>(1);
  const [added, setAdded] = useState<boolean>(false);
  const [useTransparentPng, setUseTransparentPng] = useState<boolean>(item.transparent_png);

  const handleAddToCart = () => {
    try {
      const existing = localStorage.getItem('pandawok_cart');
      let cart = existing ? JSON.parse(existing) : [];

      const index = cart.findIndex((c: { id: string }) => c.id === item.id);
      if (index !== -1) {
        cart[index].quantity += quantity;
      } else {
        cart.push({
          id: item.id,
          name: item.name_en,
          price: item.price,
          image_url: item.image_url,
          quantity: quantity
        });
      }

      localStorage.setItem('pandawok_cart', JSON.stringify(cart));
      window.dispatchEvent(new Event('cart-updated'));

      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/menu"
          className="p-2 rounded-full bg-brand-card border border-brand-border text-brand-paper hover:bg-brand-border transition-colors flex items-center space-x-1 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </Link>

        {item.transparent_png && (
          <button
            onClick={() => setUseTransparentPng(!useTransparentPng)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              useTransparentPng
                ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                : 'bg-brand-card border-brand-border text-brand-muted'
            }`}
          >
            Transparent PNG: {useTransparentPng ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {/* Main Image View Container */}
      <div className={`relative w-full h-72 rounded-2xl overflow-hidden border border-brand-border flex items-center justify-center transition-all ${
        useTransparentPng ? 'bg-gradient-to-b from-zinc-900 to-brand-dark p-6' : 'bg-zinc-900'
      }`}>
        <img
          src={item.image_url}
          alt={item.name_en}
          className={`w-full h-full object-cover transition-transform duration-500 hover:scale-105 ${
            useTransparentPng ? 'object-contain drop-shadow-[0_20px_20px_rgba(220,38,38,0.35)]' : ''
          }`}
        />

        <div className="absolute top-3 left-3 flex gap-2">
          {item.is_spicy && (
            <span className="bg-red-950/90 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full border border-red-800 flex items-center space-x-1">
              <Flame className="w-3.5 h-3.5" />
              <span>Spicy</span>
            </span>
          )}
          {item.is_vegetarian && (
            <span className="bg-green-950/90 text-green-400 text-xs font-bold px-2.5 py-1 rounded-full border border-green-800 flex items-center space-x-1">
              <Leaf className="w-3.5 h-3.5" />
              <span>Vegetarian</span>
            </span>
          )}
        </div>
      </div>

      {/* Dish Details Content */}
      <div className="mt-5 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-brand-paper">{item.name_en}</h1>
            {item.name_jp && (
              <span className="text-sm font-serif text-brand-gold">{item.name_jp}</span>
            )}
          </div>
          <p className="text-xs text-brand-gold font-medium mt-0.5">{item.name_ar}</p>
        </div>

        <p className="text-sm text-brand-muted leading-relaxed">{item.description_en}</p>

        {/* Quantity and Price */}
        <div className="flex items-center justify-between py-3 border-y border-brand-border">
          <div className="flex items-center space-x-3 bg-brand-card border border-brand-border px-3 py-1.5 rounded-xl">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="p-1 hover:text-brand-accent transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="font-bold text-sm text-brand-paper min-w-[20px] text-center">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-1 hover:text-brand-accent transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="text-right">
            <span className="text-xs text-brand-muted block">Total Price</span>
            <span className="text-xl font-extrabold text-brand-paper">{item.price * quantity} EGP</span>
          </div>
        </div>

        {/* Add to Cart CTA */}
        <button
          onClick={handleAddToCart}
          disabled={!item.is_available}
          className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm shadow-xl flex items-center justify-center space-x-2 transition-all active:scale-98 ${
            !item.is_available
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : added
              ? 'bg-green-600 text-white'
              : 'bg-brand-accent hover:bg-red-700 text-white shadow-brand-accent/30'
          }`}
        >
          {added ? (
            <>
              <Check className="w-5 h-5" />
              <span>Added to Order!</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-5 h-5" />
              <span>Add {quantity} to Order • {item.price * quantity} EGP</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
