'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Bot, Key, ShieldCheck, Cpu, Database, Save, Check } from 'lucide-react';

export default function AdminAIPage() {
  const [provider, setProvider] = useState('OpenAI');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('sk-proj-********************');
  const [saved, setSaved] = useState(false);

  const insights = [
    { title: 'Popular Combination', desc: '82% of Tokyo Shoyu Ramen orders include Prawn Gyoza as a side.', confidence: 'High' },
    { title: 'Demand Spike Forecast', desc: 'Wok orders peak on Friday evenings between 7:00 PM and 10:00 PM.', confidence: 'Medium' }
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">AI Administration Center</h1>
          <p className="text-xs text-brand-muted">Provider configuration, API key secret management & AI operational insights.</p>
        </div>

        {/* AI Key & Provider Config Form */}
        <form onSubmit={handleSave} className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Bot className="w-4 h-4" />
            <span>AI Provider Setup & Fallbacks</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-brand-muted mb-1">Primary AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
            >
              <option value="OpenAI">OpenAI (GPT-4o)</option>
              <option value="Anthropic">Anthropic (Claude 3.5 Sonnet)</option>
              <option value="Groq">Groq Llama 3</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-brand-muted mb-1">Active Model Name</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-brand-muted mb-1">API Secret Key (Stored Server-Side Only)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
            />
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
                <span>AI Credentials Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save AI Configuration</span>
              </>
            )}
          </button>
        </form>

        {/* Operational AI Insights */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold">AI Operational Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <div key={i} className="bg-brand-dark border border-brand-border rounded-xl p-3.5 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-brand-paper">{ins.title}</h3>
                  <span className="text-[10px] bg-brand-gold/20 text-brand-gold font-bold px-2 py-0.5 rounded border border-brand-gold/30">
                    {ins.confidence} Confidence
                  </span>
                </div>
                <p className="text-brand-muted text-[11px] leading-relaxed">{ins.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
