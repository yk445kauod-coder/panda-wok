'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { FeatureFlags } from '@/lib/types';
import { Settings, Save, Check } from 'lucide-react';

export default function AdminSettingsPage() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    const f = await DataService.getFeatureFlags();
    setFlags(f);
  };

  const handleToggle = (key: keyof FeatureFlags) => {
    if (!flags) return;
    setFlags({ ...flags, [key]: !flags[key] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flags) return;
    await DataService.updateFeatureFlags(flags);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!flags) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Module Feature Flags</h1>
          <p className="text-xs text-brand-muted">Enable or disable platform capabilities across customer app & admin.</p>
        </div>

        <form onSubmit={handleSave} className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Settings className="w-4 h-4" />
            <span>Customer Platform Modules</span>
          </h2>

          <div className="space-y-2.5">
            {Object.entries(flags).map(([key, enabled]) => (
              <div key={key} className="bg-brand-dark border border-brand-border p-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-brand-paper uppercase">{key.replace('_', ' ')}</span>
                  <p className="text-[10px] text-brand-muted">Customer-facing {key} feature access</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(key as keyof FeatureFlags)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    enabled
                      ? 'bg-brand-bamboo text-white'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
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
                <span>Feature Toggles Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Feature Flags</span>
              </>
            )}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
