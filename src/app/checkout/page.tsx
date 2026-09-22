'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { Address } from '@/lib/types';
import { MapPin, Phone, User, CreditCard, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CheckoutPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [landmark, setLandmark] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [cartItems, setCartItems] = useState<{ id: string; name: string; price: number; quantity: number }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const rawCart = localStorage.getItem('pandawok_cart');
      if (rawCart) {
        setCartItems(JSON.parse(rawCart));
      }
      const rawUser = localStorage.getItem('pandawok_user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u.full_name) setCustomerName(u.full_name);
        if (u.phone) setCustomerPhone(u.phone);
        if (u.address) {
          setStreet(u.address.street || '');
          setBuilding(u.address.building || '');
          setFloor(u.address.floor || '');
          setApartment(u.address.apartment || '');
          setLandmark(u.address.landmark || '');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryFee = subtotal > 0 ? 30 : 0;
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !street.trim()) {
      setErrorMessage('Please fill in your name, phone number, and street address.');
      return;
    }
    if (cartItems.length === 0) {
      setErrorMessage('Your cart is empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const deliveryAddress: Address = {
        id: `addr-${Date.now()}`,
        title: 'Delivery Address',
        street,
        building,
        floor,
        apartment,
        landmark,
        city: 'Alexandria',
        delivery_notes: deliveryNotes
      };

      // Generate Idempotency Key
      const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const orderPayload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        items: cartItems.map(item => ({ menu_item_id: item.id, quantity: item.quantity })),
        notes: deliveryNotes,
        idempotency_key: idempotencyKey
      };

      const createdOrder = await DataService.createOrder(orderPayload);

      // Save user details for future checkout convenience
      localStorage.setItem('pandawok_user', JSON.stringify({
        full_name: customerName,
        phone: customerPhone,
        address: deliveryAddress
      }));

      // Clear Cart
      localStorage.removeItem('pandawok_cart');
      window.dispatchEvent(new Event('cart-updated'));

      // Redirect to Order Tracking Screen
      router.push(`/order/${createdOrder.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit order. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto">
        <Link
          href="/cart"
          className="inline-flex items-center space-x-1 text-xs font-semibold text-brand-muted hover:text-brand-paper mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cart</span>
        </Link>

        <h1 className="text-2xl font-extrabold tracking-wide mb-1 flex items-center space-x-2">
          <ShieldCheck className="w-6 h-6 text-brand-accent" />
          <span>Checkout & Delivery</span>
        </h1>
        <p className="text-xs text-brand-muted mb-4">
          Enter your Alexandria delivery address and confirm order.
        </p>

        {errorMessage && (
          <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3.5 rounded-2xl mb-4 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handlePlaceOrder} className="space-y-4">
          {/* Customer Info Card */}
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Contact Information</span>
            </h2>

            <div>
              <label className="block text-[11px] text-brand-muted mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Omar Hassan"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-brand-muted mb-1">Phone Number (Egyptian) *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. +201012345678"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
              />
            </div>
          </div>

          {/* Delivery Location Card */}
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>Alexandria Delivery Address</span>
            </h2>

            <div>
              <label className="block text-[11px] text-brand-muted mb-1">Street / Area *</label>
              <input
                type="text"
                required
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="e.g. Fouad Street, Kafr Abdo"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-brand-muted mb-1">Building</label>
                <input
                  type="text"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="Bldg 14"
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-2.5 py-1.5 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] text-brand-muted mb-1">Floor</label>
                <input
                  type="text"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  placeholder="3rd"
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-2.5 py-1.5 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] text-brand-muted mb-1">Apartment</label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                  placeholder="302"
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-2.5 py-1.5 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-brand-muted mb-1">Nearest Landmark</label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. Near St. Mark College"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-brand-muted mb-1">Kitchen & Delivery Notes</label>
              <textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="e.g. Extra spicy, call on arrival..."
                rows={2}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent resize-none"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5 mb-2">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Payment Option</span>
            </h2>

            <div className="bg-brand-dark border border-brand-accent/40 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">💵</span>
                <div>
                  <p className="text-xs font-bold text-brand-paper">Cash on Delivery (COD)</p>
                  <p className="text-[10px] text-brand-muted">Pay in Egyptian Pounds upon doorstep delivery</p>
                </div>
              </div>
              <span className="w-3 h-3 rounded-full bg-brand-accent" />
            </div>
          </div>

          {/* Submit Order Button */}
          <button
            type="submit"
            disabled={isSubmitting || cartItems.length === 0}
            className={`w-full py-4 px-6 rounded-2xl font-bold text-sm shadow-xl flex items-center justify-center space-x-2 transition-all ${
              isSubmitting
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                : 'bg-brand-accent hover:bg-red-700 text-white shadow-brand-accent/30 active:scale-98'
            }`}
          >
            {isSubmitting ? (
              <span>Submitting Order to Kitchen...</span>
            ) : (
              <span>Confirm Order • {total} EGP</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
