'use client';

import React, { useEffect, useState } from 'react';
import { NavigationBar } from '@/components/NavigationBar';
import { User, MapPin, Phone, Award, Clock, Save, Check } from 'lucide-react';

export default function AccountPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pandawok_user');
      if (raw) {
        const u = JSON.parse(raw);
        setFullName(u.full_name || '');
        setPhone(u.phone || '');
        if (u.address) {
          setStreet(u.address.street || '');
          setBuilding(u.address.building || '');
          setFloor(u.address.floor || '');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      full_name: fullName,
      phone,
      address: {
        street,
        building,
        floor,
        city: 'Alexandria'
      }
    };
    localStorage.setItem('pandawok_user', JSON.stringify(payload));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Profile Card Header */}
        <div className="bg-rice-pattern bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center space-x-4">
          <div className="w-14 h-14 rounded-full bg-brand-accent flex items-center justify-center font-extrabold text-2xl text-white shadow-lg">
            🐼
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-brand-paper">{fullName || 'Panda Guest'}</h1>
            <p className="text-xs text-brand-gold font-medium">{phone || 'Alexandria Member'}</p>
          </div>
        </div>

        {/* Account Details Form */}
        <form onSubmit={handleSave} className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5" />
            <span>Customer Info & Saved Location</span>
          </h2>

          <div>
            <label className="block text-[11px] text-brand-muted mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Omar Hassan"
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
            />
          </div>

          <div>
            <label className="block text-[11px] text-brand-muted mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+201012345678"
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
            />
          </div>

          <div>
            <label className="block text-[11px] text-brand-muted mb-1">Default Alexandria Street</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Fouad Street, Kafr Abdo"
              className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
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
                <span>Profile Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Profile Information</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
