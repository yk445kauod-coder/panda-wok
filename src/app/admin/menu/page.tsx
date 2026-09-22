'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { MenuItem, MenuCategory } from '@/lib/types';
import { Plus, Edit2, Check, Flame, Leaf, Image as ImageIcon, Save } from 'lucide-react';

export default function AdminMenuCMSPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const i = await DataService.getAllMenuItemsAdmin();
    const c = await DataService.getAllCategoriesAdmin();
    setItems(i);
    setCategories(c);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    await DataService.saveMenuItem(editingItem);
    setEditingItem(null);
    loadData();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-brand-border">
          <div>
            <h1 className="text-2xl font-extrabold text-brand-paper">Menu CMS Builder</h1>
            <p className="text-xs text-brand-muted">Manage dishes, transparent PNG toggles, prices, and SEO fields.</p>
          </div>

          <button
            onClick={() => setEditingItem({
              name_en: '',
              name_ar: '',
              price: 150,
              description_en: '',
              description_ar: '',
              image_url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80',
              transparent_png: true,
              is_available: true,
              is_featured: false,
              is_spicy: false,
              is_vegetarian: false
            })}
            className="py-2.5 px-4 bg-brand-accent hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Dish</span>
          </button>
        </div>

        {/* Edit Modal / Form */}
        {editingItem && (
          <form onSubmit={handleSave} className="bg-brand-card border-2 border-brand-accent rounded-2xl p-5 space-y-4 shadow-2xl">
            <h2 className="text-sm font-bold text-brand-gold uppercase tracking-wider">
              {editingItem.id ? 'Edit Dish Details' : 'Add New Menu Item'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-brand-muted mb-1">Name (English) *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name_en || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name_en: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
                />
              </div>

              <div>
                <label className="block text-[11px] text-brand-muted mb-1">Name (Arabic) *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name_ar || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name_ar: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
                />
              </div>

              <div>
                <label className="block text-[11px] text-brand-muted mb-1">Price (EGP) *</label>
                <input
                  type="number"
                  required
                  value={editingItem.price || 0}
                  onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
                />
              </div>

              <div>
                <label className="block text-[11px] text-brand-muted mb-1">Category</label>
                <select
                  value={editingItem.category_id || categories[0]?.id}
                  onChange={(e) => setEditingItem({ ...editingItem, category_id: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_en}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] text-brand-muted mb-1">Image URL</label>
                <input
                  type="url"
                  required
                  value={editingItem.image_url || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, image_url: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] text-brand-muted mb-1">Description (English)</label>
                <textarea
                  rows={2}
                  value={editingItem.description_en || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description_en: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper resize-none"
                />
              </div>
            </div>

            {/* Checkboxes & Toggles */}
            <div className="flex flex-wrap gap-4 pt-2 border-t border-brand-border text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.transparent_png ?? false}
                  onChange={(e) => setEditingItem({ ...editingItem, transparent_png: e.target.checked })}
                  className="rounded bg-brand-dark border-brand-border text-brand-accent focus:ring-0"
                />
                <span className="font-bold text-brand-gold">Transparent PNG Asset</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.is_spicy ?? false}
                  onChange={(e) => setEditingItem({ ...editingItem, is_spicy: e.target.checked })}
                  className="rounded bg-brand-dark border-brand-border text-brand-accent focus:ring-0"
                />
                <span>Spicy 🌶️</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.is_available ?? true}
                  onChange={(e) => setEditingItem({ ...editingItem, is_available: e.target.checked })}
                  className="rounded bg-brand-dark border-brand-border text-brand-accent focus:ring-0"
                />
                <span>Available in Menu</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="py-2 px-4 rounded-xl bg-brand-dark border border-brand-border text-brand-muted text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-2 px-5 rounded-xl bg-brand-accent text-white font-bold text-xs shadow-lg flex items-center space-x-1"
              >
                <Save className="w-4 h-4" />
                <span>Save Dish</span>
              </button>
            </div>
          </form>
        )}

        {/* Menu Items Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs text-brand-paper">
            <thead className="bg-brand-dark text-brand-gold font-bold uppercase text-[10px] border-b border-brand-border">
              <tr>
                <th className="p-3.5">Dish</th>
                <th className="p-3.5">Price</th>
                <th className="p-3.5">Transparent PNG</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-brand-border/40">
                  <td className="p-3.5 flex items-center space-x-3">
                    <img src={item.image_url} alt={item.name_en} className="w-10 h-10 rounded-lg object-cover border border-brand-border" />
                    <div>
                      <p className="font-bold">{item.name_en}</p>
                      <p className="text-[10px] text-brand-muted">{item.name_ar}</p>
                    </div>
                  </td>
                  <td className="p-3.5 font-bold text-brand-gold">{item.price} EGP</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.transparent_png ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-zinc-800 text-zinc-400'}`}>
                      {item.transparent_png ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.is_available ? 'bg-brand-accent/20 text-brand-accent' : 'bg-zinc-800 text-zinc-500'}`}>
                      {item.is_available ? 'AVAILABLE' : 'OFFLINE'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="p-1.5 rounded-lg bg-brand-dark border border-brand-border text-brand-paper hover:text-brand-accent"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
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
