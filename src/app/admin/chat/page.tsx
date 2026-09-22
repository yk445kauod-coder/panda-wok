'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { MessageSquare, Send, User, CheckCheck } from 'lucide-react';

export default function AdminChatPage() {
  const [messages, setMessages] = useState([
    { sender: 'customer', text: 'Hi, can I add extra soy sauce to order #1001?', time: '12:40 PM' },
    { sender: 'staff', text: 'Hello Omar! Sure thing, kitchen noted your request.', time: '12:42 PM' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages(prev => [...prev, { sender: 'staff', text: input, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setInput('');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="pb-4 border-b border-brand-border">
          <h1 className="text-2xl font-extrabold text-brand-paper">Live Customer Staff Chat</h1>
          <p className="text-xs text-brand-muted">Real-time direct messaging with active ordering customers.</p>
        </div>

        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col h-[500px] max-w-xl">
          {/* Active Conversation Header */}
          <div className="bg-brand-dark p-3.5 border-b border-brand-border flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-brand-accent/20 border border-brand-accent flex items-center justify-center font-bold text-xs text-brand-paper">
                OH
              </div>
              <div>
                <h3 className="font-bold text-xs text-brand-paper">Omar Hassan</h3>
                <p className="text-[10px] text-brand-gold">Order #1001 • Kafr Abdo, Alexandria</p>
              </div>
            </div>
            <span className="text-[10px] bg-green-950 text-green-400 font-bold px-2 py-0.5 rounded border border-green-800">
              Online
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.sender === 'staff' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3 rounded-2xl max-w-[80%] ${
                    m.sender === 'staff'
                      ? 'bg-brand-accent text-white rounded-br-none'
                      : 'bg-brand-dark border border-brand-border text-brand-paper rounded-bl-none'
                  }`}
                >
                  <p>{m.text}</p>
                </div>
                <span className="text-[9px] text-brand-muted mt-1">{m.time}</span>
              </div>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-3 bg-brand-dark border-t border-brand-border flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Reply to customer..."
              className="flex-1 bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
            />
            <button
              type="submit"
              className="p-2 bg-brand-accent hover:bg-red-700 text-white font-bold rounded-xl"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
