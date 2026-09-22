'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { ActivityLog } from '@/lib/types';
import { Users, Clock, DollarSign, Award, Activity } from 'lucide-react';

export default function AdminCRMPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    const list = await DataService.getActivityLogs();
    setLogs(list);
  };

  const sampleCustomers = [
    { name: 'Omar Hassan', phone: '+201012345678', totalSpent: 890, ordersCount: 3, tier: 'GOLD', lastOrder: '20 mins ago' },
    { name: 'Nour El Din', phone: '+201098765432', totalSpent: 450, ordersCount: 2, tier: 'SILVER', lastOrder: '2 days ago' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Cloud Kitchen CRM & Activity Log</h1>
          <p className="text-xs text-brand-muted">Customer profiles, total spending, order frequency & timeline events.</p>
        </div>

        {/* Customer Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4">
            <span className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">Total Customers</span>
            <p className="text-2xl font-extrabold text-brand-paper mt-1">128</p>
          </div>
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4">
            <span className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">Repeat Customer Rate</span>
            <p className="text-2xl font-extrabold text-brand-paper mt-1">64.5%</p>
          </div>
          <div className="bg-brand-card border border-brand-border rounded-2xl p-4">
            <span className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">Avg Customer LTV</span>
            <p className="text-2xl font-extrabold text-brand-paper mt-1">670 EGP</p>
          </div>
        </div>

        {/* Customer Profiles Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-x-auto">
          <div className="p-4 border-b border-brand-border">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold">Customer Accounts</h2>
          </div>
          <table className="w-full text-left text-xs text-brand-paper">
            <thead className="bg-brand-dark text-brand-gold font-bold uppercase text-[10px] border-b border-brand-border">
              <tr>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Phone</th>
                <th className="p-3.5">Total Spent</th>
                <th className="p-3.5">Orders</th>
                <th className="p-3.5">Loyalty Tier</th>
                <th className="p-3.5">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {sampleCustomers.map((c, i) => (
                <tr key={i} className="hover:bg-brand-border/40">
                  <td className="p-3.5 font-bold">{c.name}</td>
                  <td className="p-3.5 text-brand-muted">{c.phone}</td>
                  <td className="p-3.5 font-extrabold text-brand-accent">{c.totalSpent} EGP</td>
                  <td className="p-3.5 font-bold">{c.ordersCount}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                      {c.tier}
                    </span>
                  </td>
                  <td className="p-3.5 text-brand-muted">{c.lastOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Activity Timeline */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Activity className="w-4 h-4" />
            <span>Customer Activity Log Timeline</span>
          </h2>

          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-brand-dark border border-brand-border rounded-xl p-3 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-brand-paper">{log.action}</span>
                  <p className="text-[10px] text-brand-muted">{JSON.stringify(log.metadata || {})}</p>
                </div>
                <span className="text-[10px] text-brand-muted">{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
