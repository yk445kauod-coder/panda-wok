'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DataService } from '@/lib/dataService';
import { Order, OrderStatus } from '@/lib/types';
import { NavigationBar } from '@/components/NavigationBar';
import { Clock, CheckCircle2, Truck, UtensilsCrossed, PackageCheck, AlertCircle, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';

const STAGES: { status: OrderStatus; title: string; icon: any; desc: string }[] = [
  { status: 'NEW', title: 'Order Received', icon: Clock, desc: 'Kitchen received your order' },
  { status: 'CHECKED', title: 'Order Accepted', icon: CheckCircle2, desc: 'Chef verified ingredients & stock' },
  { status: 'IN_PROGRESS', title: 'Flame-Searing Wok', icon: UtensilsCrossed, desc: 'Cooked fresh on high heat' },
  { status: 'PREPARED', title: 'Packed & Ready', icon: PackageCheck, desc: 'Thermally packed for hot delivery' },
  { status: 'OUT_FOR_DELIVERY', title: 'On The Way', icon: Truck, desc: 'Courier heading to your address' },
  { status: 'FINISHED', title: 'Delivered', icon: CheckCircle2, desc: 'Enjoy your Panda Wok feast!' },
];

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 10000); // Poll status
    return () => clearInterval(interval);
  }, [orderId]);

  const fetchOrder = async () => {
    if (!orderId) return;
    const data = await DataService.getOrderById(orderId);
    if (data) {
      setOrder(data);
      if (data.status === 'FINISHED') {
        try {
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center text-brand-paper">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-accent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-brand-dark text-brand-paper p-6 text-center">
        <NavigationBar />
        <div className="max-w-md mx-auto mt-12 bg-brand-card border border-brand-border rounded-2xl p-6 space-y-3">
          <AlertCircle className="w-10 h-10 text-brand-accent mx-auto" />
          <h1 className="text-lg font-bold">Order Not Found</h1>
          <p className="text-xs text-brand-muted">We could not locate order details for ID #{orderId}</p>
        </div>
      </div>
    );
  }

  const currentStageIndex = STAGES.findIndex(s => s.status === order.status);

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto">
        {/* Header Summary */}
        <div className="bg-rice-pattern bg-brand-card border border-brand-border rounded-2xl p-4 text-center mb-4">
          <span className="text-[10px] font-bold tracking-widest text-brand-gold uppercase block mb-1">
            Live Order Tracker
          </span>
          <h1 className="text-2xl font-extrabold text-brand-paper">Order #{order.order_number}</h1>
          <p className="text-xs text-brand-muted mt-1">
            Estimated Delivery: <span className="text-brand-paper font-bold">30 - 40 Mins</span>
          </p>
        </div>

        {/* Timeline Visualizer */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 mb-4 space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold">Kitchen Status Timeline</h2>

          <div className="space-y-6 relative before:absolute before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-brand-border">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isPassed = currentStageIndex >= idx;
              const isCurrent = currentStageIndex === idx;

              return (
                <div key={stage.status} className="relative flex items-start space-x-4 z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                      isCurrent
                        ? 'bg-brand-accent border-white text-white shadow-lg shadow-brand-accent/50 scale-110 animate-bounce'
                        : isPassed
                        ? 'bg-brand-bamboo border-green-500 text-white'
                        : 'bg-brand-dark border-brand-border text-brand-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div>
                    <h3
                      className={`text-xs font-bold ${
                        isCurrent ? 'text-brand-accent text-sm' : isPassed ? 'text-brand-paper' : 'text-brand-muted'
                      }`}
                    >
                      {stage.title}
                    </h3>
                    <p className="text-[11px] text-brand-muted mt-0.5">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Delivery Address & Order Receipt */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3 text-xs">
          <h2 className="font-bold text-brand-gold uppercase text-[10px] tracking-wider">Receipt Summary</h2>

          <div className="space-y-1.5 border-b border-brand-border pb-3">
            {order.items?.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.quantity}x {item.item_name}</span>
                <span className="font-bold text-brand-paper">{item.subtotal} EGP</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-brand-muted">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{order.subtotal} EGP</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery Fee</span>
              <span>{order.delivery_fee} EGP</span>
            </div>
            <div className="flex justify-between text-brand-paper font-extrabold text-sm pt-1 border-t border-brand-border">
              <span>Total</span>
              <span className="text-brand-accent">{order.total} EGP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
