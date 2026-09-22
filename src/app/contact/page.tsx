import React from 'react';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { Phone, MapPin, Clock, Globe } from 'lucide-react';

export default async function ContactPage() {
  const settings = await DataService.getRestaurantSettings();

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-extrabold tracking-wide mb-1">Contact Panda Wok</h1>
        <p className="text-xs text-brand-muted">Operating Cloud Kitchen Hub in Alexandria, Egypt.</p>

        <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-4 text-xs">
          <div className="flex items-start space-x-3">
            <Phone className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-brand-paper">Order Hotline & WhatsApp</p>
              <p className="text-brand-muted mt-0.5">{settings.phone}</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <MapPin className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-brand-paper">Kitchen Hub Location</p>
              <p className="text-brand-muted mt-0.5">{settings.address_en}</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Clock className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-brand-paper">Operating Hours</p>
              <p className="text-brand-muted mt-0.5">{settings.opening_hours}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
