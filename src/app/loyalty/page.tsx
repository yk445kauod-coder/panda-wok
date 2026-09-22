'use client';

import React from 'react';
import { NavigationBar } from '@/components/NavigationBar';
import { Flame, Gift, Sparkles, Award, ArrowRight } from 'lucide-react';

export default function LoyaltyPage() {
  const points = 240;
  const tier = 'GOLD';

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Virtual Digital Loyalty Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-950 via-brand-card to-zinc-950 border border-brand-gold/40 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-brand-gold/10 blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🐉</span>
              <span className="font-extrabold text-brand-gold tracking-widest text-xs uppercase">
                Panda Wok Rewards
              </span>
            </div>
            <span className="bg-brand-gold text-black text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
              {tier} TIER
            </span>
          </div>

          <div>
            <span className="text-xs text-brand-muted block">Available Balance</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-extrabold text-brand-paper">{points}</span>
              <span className="text-sm font-bold text-brand-gold">Points</span>
            </div>
          </div>

          <div className="pt-2 border-t border-brand-gold/20 flex items-center justify-between text-[11px] text-brand-muted">
            <span>Spend 10 EGP = Earn 1 Point</span>
            <span>10 Points = 1 EGP Cash</span>
          </div>
        </div>

        {/* Redeemable Rewards Section */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Gift className="w-3.5 h-3.5" />
            <span>Redeemable Rewards</span>
          </h2>

          <div className="space-y-2.5">
            <div className="bg-brand-dark border border-brand-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-brand-paper">Free Pan-Seared Gyoza (5 pcs)</p>
                <p className="text-[10px] text-brand-muted">Requires 150 Points</p>
              </div>
              <button className="px-3 py-1.5 bg-brand-gold text-black font-bold text-xs rounded-xl hover:bg-amber-600 transition-colors">
                Redeem
              </button>
            </div>

            <div className="bg-brand-dark border border-brand-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-brand-paper">50 EGP Order Discount</p>
                <p className="text-[10px] text-brand-muted">Requires 500 Points</p>
              </div>
              <button className="px-3 py-1.5 bg-brand-border text-brand-muted font-bold text-xs rounded-xl cursor-not-allowed">
                Need 500 Pts
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
