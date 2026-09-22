'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { RestaurantSettings } from '@/lib/types';
import { Flame, Save, Check } from 'lucide-react';

export default function AdminLoyaltyPage() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await DataService.getRestaurantSettings();
    setSettings(s);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await DataService.updateRestaurantSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Loyalty System Configuration</h1>
          <p className="text-xs text-brand-muted">Configure editable points calculation rules and redemption rates.</p>
        </div>

        <form onSubmit={handleSave} className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-bold text-brand-gold mb-1">
              Points Earn Rate (Points per 1 EGP spent)
            </label>
            <input
              type="number"
              step="0.01"
              value={settings.loyalty_points_per_egp}
              onChange={(e) => setSettings({ ...settings, loyalty_points_per_egp: Number(e.target.value) })}
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
            />
            <span className="text-[10px] text-brand-muted mt-1 block">0.1 = Earn 1 point for every 10 EGP spent.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-brand-gold mb-1">
              Redemption Rate (Points required per 1 EGP discount)
            </label>
            <input
              type="number"
              value={settings.loyalty_redemption_rate}
              onChange={(e) => setSettings({ ...settings, loyalty_redemption_rate: Number(e.target.value) })}
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
            />
            <span className="text-[10px] text-brand-muted mt-1 block">10 = 10 points can be redeemed for 1 EGP discount.</span>
          </div>

          <button
            type="submit"
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
              saved ? 'bg-green-600 text-white' : 'bg-brand-accent hover:bg-red-700 text-white'
            }`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Loyalty Settings Updated</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Loyalty Rules</span>
              </>
            )}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
