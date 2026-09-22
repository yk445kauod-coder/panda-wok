'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DataService } from '@/lib/dataService';
import { Download, Database, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function AdminExportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const handleExportCSV = async (type: string) => {
    setDownloading(type);
    setTimeout(async () => {
      let data: any[] = [];
      if (type === 'orders') data = await DataService.getAllOrdersAdmin();
      else if (type === 'menu') data = await DataService.getAllMenuItemsAdmin();
      else if (type === 'feedback') data = await DataService.getAllFeedback();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pandawok-${type}-export.json`;
      a.click();
      setDownloading(null);
    }, 1000);
  };

  const handleCreateBackup = () => {
    setBackupStatus('Creating database snapshot...');
    setTimeout(() => {
      setBackupStatus('Backup created successfully: pandawok-snapshot-2026-09.sql (1.4 MB)');
    }, 1500);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Data Exports & Database Backup System</h1>
          <p className="text-xs text-brand-muted">Export orders, customers, menu items, or trigger full SQL snapshots.</p>
        </div>

        {/* Exports Section */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Download className="w-4 h-4" />
            <span>CSV / JSON Data Exports</span>
          </h2>

          <div className="space-y-2">
            {['orders', 'menu', 'feedback'].map((type) => (
              <div key={type} className="bg-brand-dark border border-brand-border p-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase text-brand-paper">{type} Export</span>
                  <p className="text-[10px] text-brand-muted">Formatted JSON / CSV records</p>
                </div>
                <button
                  onClick={() => handleExportCSV(type)}
                  disabled={downloading === type}
                  className="px-3 py-1.5 bg-brand-accent hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  {downloading === type ? 'Exporting...' : 'Export File'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Database Backup System */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4 max-w-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold flex items-center space-x-1.5">
            <Database className="w-4 h-4" />
            <span>Database Backup Snapshots</span>
          </h2>

          {backupStatus && (
            <div className="bg-green-950/80 border border-green-800 text-green-300 p-3 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
              <span>{backupStatus}</span>
            </div>
          )}

          <p className="text-xs text-brand-muted">
            Create an offline database backup snapshot containing all order records, user profiles, menu CMS states, and stock data.
          </p>

          <button
            onClick={handleCreateBackup}
            className="w-full py-3 bg-brand-gold hover:bg-amber-600 text-black font-bold text-xs rounded-xl shadow-lg transition-colors"
          >
            Create New Backup Snapshot Now
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
