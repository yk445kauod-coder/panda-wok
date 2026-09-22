'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { StockItem } from '@/lib/types';
import { Layers, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export default function AdminStockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);

  useEffect(() => {
    loadStock();
  }, []);

  const loadStock = async () => {
    const list = await DataService.getStockItems();
    setStock(list);
  };

  const handleUpdateQuantity = async (id: string, newQty: number) => {
    await DataService.updateStockQuantity(id, newQty);
    loadStock();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Stock Management</h1>
          <p className="text-xs text-brand-muted">Track raw ingredients and automated dish availability thresholds.</p>
        </div>

        {/* Stock Items Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs text-brand-paper">
            <thead className="bg-brand-dark text-brand-gold font-bold uppercase text-[10px] border-b border-brand-border">
              <tr>
                <th className="p-3.5">Ingredient / Stock Item</th>
                <th className="p-3.5">Quantity</th>
                <th className="p-3.5">Min Threshold</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {stock.map((item) => (
                <tr key={item.id} className="hover:bg-brand-border/40">
                  <td className="p-3.5 font-bold text-brand-paper">{item.name}</td>
                  <td className="p-3.5 font-extrabold text-brand-gold">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="p-3.5 text-brand-muted">{item.min_threshold} {item.unit}</td>
                  <td className="p-3.5">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${
                      item.status === 'IN_STOCK'
                        ? 'bg-green-950 text-green-400 border-green-800'
                        : item.status === 'LOW_STOCK'
                        ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-red-950 text-red-400 border-red-800'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3.5 flex items-center space-x-2">
                    <button
                      onClick={() => handleUpdateQuantity(item.id, Math.max(0, item.quantity - 5))}
                      className="px-2 py-1 rounded bg-brand-dark border border-brand-border text-brand-paper hover:text-brand-accent text-[11px] font-bold"
                    >
                      -5 {item.unit}
                    </button>
                    <button
                      onClick={() => handleUpdateQuantity(item.id, item.quantity + 5)}
                      className="px-2 py-1 rounded bg-brand-dark border border-brand-border text-brand-paper hover:text-brand-gold text-[11px] font-bold"
                    >
                      +5 {item.unit}
                    </button>
                    <button
                      onClick={() => handleUpdateQuantity(item.id, 0)}
                      className="px-2 py-1 rounded bg-red-950 text-red-400 border border-red-800 text-[10px] font-bold"
                    >
                      Zero (Out of Stock)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
