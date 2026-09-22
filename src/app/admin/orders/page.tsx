'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { Order, OrderStatus } from '@/lib/types';
import { Utensils, CheckCircle2, Clock, Truck, PackageCheck, AlertCircle, RefreshCw } from 'lucide-react';

const STATUS_FLOW: OrderStatus[] = ['NEW', 'CHECKED', 'IN_PROGRESS', 'PREPARED', 'OUT_FOR_DELIVERY', 'FINISHED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isKdsView, setIsKdsView] = useState(false);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 8000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    const list = await DataService.getAllOrdersAdmin();
    setOrders(list);
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    await DataService.updateOrderStatus(orderId, newStatus);
    loadOrders();
  };

  const filteredOrders = filterStatus === 'ALL'
    ? orders
    : orders.filter(o => o.status === filterStatus);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-brand-border">
          <div>
            <h1 className="text-2xl font-extrabold text-brand-paper">Orders & Kitchen Display (KDS)</h1>
            <p className="text-xs text-brand-muted">Manage active kitchen production tickets and delivery status.</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsKdsView(!isKdsView)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                isKdsView
                  ? 'bg-brand-accent border-brand-accent text-white'
                  : 'bg-brand-card border-brand-border text-brand-gold hover:bg-brand-border'
              }`}
            >
              {isKdsView ? '📊 Table View' : '🍳 Kitchen Display Mode'}
            </button>
            <button
              onClick={loadOrders}
              className="p-2 rounded-xl bg-brand-card border border-brand-border text-brand-paper hover:bg-brand-border"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex space-x-2 overflow-x-auto pb-2">
          {['ALL', 'NEW', 'CHECKED', 'IN_PROGRESS', 'PREPARED', 'OUT_FOR_DELIVERY', 'FINISHED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                filterStatus === st
                  ? 'bg-brand-accent border-brand-accent text-white'
                  : 'bg-brand-card border-brand-border text-brand-muted hover:text-brand-paper'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* KDS Mode Grid or Orders Table */}
        {isKdsView ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-brand-card border-2 border-brand-border rounded-2xl p-4 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center border-b border-brand-border pb-2">
                    <span className="font-extrabold text-base text-brand-paper">#{order.order_number}</span>
                    <span className="bg-brand-gold/20 text-brand-gold text-[10px] font-bold px-2 py-0.5 rounded-md border border-brand-gold/40">
                      {order.status}
                    </span>
                  </div>

                  <div className="py-2 space-y-1 text-xs">
                    <p className="font-bold text-brand-paper">{order.customer_name} ({order.customer_phone})</p>
                    <p className="text-brand-muted text-[11px]">{order.delivery_address.street}</p>
                    {order.notes && (
                      <p className="text-red-400 font-semibold bg-red-950/40 p-1.5 rounded-lg border border-red-800/40 text-[11px] mt-1">
                        Note: {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-brand-border pt-2 space-y-1 text-xs">
                    <p className="font-bold text-brand-gold text-[11px]">Items:</p>
                    {order.items?.map((item, i) => (
                      <div key={i} className="flex justify-between font-medium">
                        <span>{item.quantity}x {item.item_name}</span>
                        <span>{item.subtotal} EGP</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-brand-border flex gap-2">
                  {STATUS_FLOW.map((st) => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(order.id, st)}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-lg border ${
                        order.status === st
                          ? 'bg-brand-accent border-brand-accent text-white'
                          : 'bg-brand-dark border-brand-border text-brand-muted hover:text-white'
                      }`}
                    >
                      {st.slice(0, 4)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-brand-card border border-brand-border rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs text-brand-paper">
              <thead className="bg-brand-dark text-brand-gold font-bold uppercase text-[10px] border-b border-brand-border">
                <tr>
                  <th className="p-3.5">Order #</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Total</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-brand-border/40">
                    <td className="p-3.5 font-bold">#{order.order_number}</td>
                    <td className="p-3.5">
                      <p className="font-semibold">{order.customer_name}</p>
                      <p className="text-[10px] text-brand-muted">{order.customer_phone}</p>
                    </td>
                    <td className="p-3.5 font-extrabold text-brand-accent">{order.total} EGP</td>
                    <td className="p-3.5">
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-brand-gold/10 text-brand-gold border border-brand-gold/30">
                        {order.status}
                      </span>
                    </td>
                    <td className="p-3.5 flex gap-1">
                      {STATUS_FLOW.map((st) => (
                        <button
                          key={st}
                          onClick={() => handleUpdateStatus(order.id, st)}
                          className={`px-2 py-1 text-[10px] font-bold rounded border ${
                            order.status === st
                              ? 'bg-brand-accent text-white border-brand-accent'
                              : 'bg-brand-dark text-brand-muted border-brand-border hover:text-brand-paper'
                          }`}
                        >
                          {st.slice(0, 3)}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
