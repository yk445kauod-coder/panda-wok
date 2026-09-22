'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavigationBar } from '@/components/NavigationBar';
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
}

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [upsellAdded, setUpsellAdded] = useState<boolean>(false);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    try {
      const raw = localStorage.getItem('pandawok_cart');
      if (raw) {
        setCartItems(JSON.parse(raw));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateQuantity = (id: string, newQty: number) => {
    if (newQty <= 0) {
      removeItem(id);
      return;
    }
    const updated = cartItems.map(item => item.id === id ? { ...item, quantity: newQty } : item);
    setCartItems(updated);
    localStorage.setItem('pandawok_cart', JSON.stringify(updated));
    window.dispatchEvent(new Event('cart-updated'));
  };

  const removeItem = (id: string) => {
    const updated = cartItems.filter(item => item.id !== id);
    setCartItems(updated);
    localStorage.setItem('pandawok_cart', JSON.stringify(updated));
    window.dispatchEvent(new Event('cart-updated'));
  };

  const addUpsellGyoza = () => {
    const gyoza = {
      id: 'item-4',
      name: 'Pan-Seared Prawn Gyoza (5 pcs)',
      price: 150,
      image_url: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80',
      quantity: 1
    };
    const existingIndex = cartItems.findIndex(i => i.id === gyoza.id);
    let updated = [...cartItems];
    if (existingIndex !== -1) {
      updated[existingIndex].quantity += 1;
    } else {
      updated.push(gyoza);
    }
    setCartItems(updated);
    localStorage.setItem('pandawok_cart', JSON.stringify(updated));
    window.dispatchEvent(new Event('cart-updated'));
    setUpsellAdded(true);
  };

  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryFee = subtotal > 0 ? 30 : 0;
  const total = subtotal + deliveryFee;

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-2xl font-extrabold tracking-wide mb-1 flex items-center space-x-2">
          <ShoppingBag className="w-6 h-6 text-brand-accent" />
          <span>Your Order Cart</span>
        </h1>
        <p className="text-xs text-brand-muted mb-4">Review items in your order before checkout.</p>

        {cartItems.length === 0 ? (
          <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center space-y-4 my-6">
            <div className="w-16 h-16 bg-brand-border rounded-full flex items-center justify-center mx-auto text-3xl">
              🥟
            </div>
            <h2 className="text-lg font-bold">Your cart is currently empty</h2>
            <p className="text-xs text-brand-muted max-w-xs mx-auto">
              Explore our flame-seared Wok, craft Ramen, and artisanal Sushi.
            </p>
            <Link
              href="/menu"
              className="inline-block py-3 px-6 bg-brand-accent text-white font-bold text-sm rounded-xl shadow-lg hover:bg-red-700 transition-colors"
            >
              Explore Full Menu
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cart Items List */}
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-brand-card border border-brand-border rounded-2xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-16 h-16 rounded-xl object-cover border border-brand-border"
                    />
                    <div>
                      <h3 className="font-bold text-sm text-brand-paper leading-tight">{item.name}</h3>
                      <p className="text-xs text-brand-gold font-bold mt-1">{item.price} EGP</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-2 bg-brand-dark border border-brand-border rounded-lg px-2 py-1">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1 hover:text-brand-accent"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1 hover:text-brand-accent"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-brand-muted hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Smart Upsell Box */}
            <div className="bg-gradient-to-r from-amber-950/30 to-brand-card border border-brand-gold/30 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-gold/20 flex items-center justify-center text-xl">
                  🥟
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-brand-gold" />
                    <span className="text-xs font-bold text-brand-gold">Chef's Upsell Pair</span>
                  </div>
                  <p className="text-xs font-semibold text-brand-paper">Pan-Seared Prawn Gyoza (5 pcs)</p>
                  <p className="text-[11px] text-brand-muted">150 EGP</p>
                </div>
              </div>

              <button
                onClick={addUpsellGyoza}
                disabled={upsellAdded}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  upsellAdded
                    ? 'bg-green-700 text-white'
                    : 'bg-brand-gold hover:bg-amber-600 text-black shadow-md'
                }`}
              >
                {upsellAdded ? 'Added' : '+ Add'}
              </button>
            </div>

            {/* Price Summary Breakdown */}
            <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-brand-muted">
                <span>Subtotal</span>
                <span>{subtotal} EGP</span>
              </div>
              <div className="flex justify-between text-brand-muted">
                <span>Delivery Fee (Alexandria)</span>
                <span>{deliveryFee} EGP</span>
              </div>
              <div className="border-t border-brand-border pt-2 flex justify-between font-extrabold text-sm text-brand-paper">
                <span>Total Amount</span>
                <span className="text-brand-accent text-base">{total} EGP</span>
              </div>
            </div>

            {/* Checkout CTA */}
            <button
              onClick={() => router.push('/checkout')}
              className="w-full py-3.5 px-6 bg-brand-accent hover:bg-red-700 text-white font-bold text-sm rounded-2xl shadow-xl shadow-brand-accent/30 flex items-center justify-center space-x-2 transition-all active:scale-98"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
