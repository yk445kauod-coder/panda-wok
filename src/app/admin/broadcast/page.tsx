'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Radio, Users, Send, CheckCircle2 } from 'lucide-react';

export default function AdminBroadcastPage() {
  const [segment, setSegment] = useState('ALL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const estimatedCount = segment === 'ALL' ? 128 : segment === 'LOYAL' ? 42 : 18;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setTitle('');
      setMessage('');
    }, 3000);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Targeted Customer Broadcast</h1>
          <p className="text-xs text-brand-muted">Send promotional notifications and order alerts to customer segments.</p>
        </div>

        {sent ? (
          <div className="bg-brand-card border border-brand-bamboo rounded-2xl p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-brand-bamboo mx-auto" />
            <h2 className="text-lg font-bold">Broadcast Dispatch Complete!</h2>
            <p className="text-xs text-brand-muted">Delivered message to {estimatedCount} customers in segment {segment}.</p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-bold text-brand-gold mb-1">Target Audience Segment</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
              >
                <option value="ALL">All Registered Customers (128 Recipients)</option>
                <option value="LOYAL">Gold/Dragon Loyalty Tier Members (42 Recipients)</option>
                <option value="INACTIVE">No Orders in Past 30 Days (18 Recipients)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-gold mb-1">Broadcast Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 20% Off Weekend Ramen Special!"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-gold mb-1">Message Body</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write message content for push notification / SMS..."
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper resize-none"
              />
            </div>

            <div className="bg-brand-dark border border-brand-border p-3 rounded-xl flex items-center justify-between text-xs text-brand-muted">
              <span>Recipient Count Preview:</span>
              <span className="font-bold text-brand-paper">{estimatedCount} Customers</span>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 bg-brand-accent hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2"
            >
              <Radio className="w-4 h-4" />
              <span>Confirm & Dispatch Broadcast</span>
            </button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
