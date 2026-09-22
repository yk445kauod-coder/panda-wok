'use client';

import React, { useState } from 'react';
import { DataService } from '@/lib/dataService';
import { PandaMascot } from '@/components/PandaMascot';
import { Send, X, Bot, Sparkles, User } from 'lucide-react';

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
}

export function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: 'Konichiwa! 🐼 I am Panda Wok AI. Ask me about spicy dishes, ramen broths, prices, or recommendations!'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setIsTyping(true);

    // AI Knowledge Base Search from database source of truth
    try {
      const items = await DataService.getMenuItems();
      const settings = await DataService.getRestaurantSettings();
      const lower = userText.toLowerCase();

      let reply = '';

      if (lower.includes('spicy') || lower.includes('hot')) {
        const spicyItems = items.filter(i => i.is_spicy);
        reply = `For spicy lovers, I recommend our ${spicyItems.map(i => `${i.name_en} (${i.price} EGP)`).join(', ')}! 🌶️`;
      } else if (lower.includes('ramen') || lower.includes('noodle')) {
        const ramen = items.filter(i => i.slug.includes('ramen'));
        reply = `Our featured Ramen is ${ramen.map(i => `${i.name_en} at ${i.price} EGP`).join('. ')}! Mins cooked in slow broth.`;
      } else if (lower.includes('sushi') || lower.includes('roll')) {
        const sushi = items.filter(i => i.slug.includes('sushi') || i.slug.includes('roll'));
        reply = `Fresh Artisanal Sushi: ${sushi.map(i => `${i.name_en} - ${i.price} EGP`).join(', ')}.`;
      } else if (lower.includes('hours') || lower.includes('open') || lower.includes('time')) {
        reply = `Panda Wok in Alexandria is open daily from ${settings.opening_hours}!`;
      } else if (lower.includes('location') || lower.includes('where') || lower.includes('address')) {
        reply = `Our cloud kitchen hub is based in ${settings.address_en}. We deliver all across Alexandria!`;
      } else {
        reply = `Panda Wok features ${items.length} chef specialities including Dragon Chicken Wok, Tokyo Shoyu Ramen, and Spicy Salmon Volcano Roll. What cuisine are you craving today?`;
      }

      setTimeout(() => {
        setMessages(prev => [...prev, { sender: 'ai', text: reply }]);
        setIsTyping(false);
      }, 600);
    } catch (e) {
      setIsTyping(false);
    }
  };

  return (
    <>
      <PandaMascot onOpenAssistant={() => setIsOpen(true)} />

      {isOpen && (
        <div className="fixed inset-x-4 bottom-20 z-50 max-w-sm mx-auto bg-brand-card border border-brand-gold/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[420px] animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-950 to-brand-card p-3.5 border-b border-brand-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center text-lg">
                🐼
              </div>
              <div>
                <h3 className="font-bold text-xs text-brand-paper flex items-center space-x-1">
                  <span>Panda AI Concierge</span>
                  <Sparkles className="w-3 h-3 text-brand-gold" />
                </h3>
                <span className="text-[10px] text-brand-muted">Database-Grounded Menu Assistant</span>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full text-brand-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex items-start space-x-2 ${
                  m.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.sender === 'ai' && (
                  <div className="w-6 h-6 rounded-full bg-brand-accent/20 flex items-center justify-center shrink-0 text-xs">
                    🐼
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-2xl max-w-[80%] ${
                    m.sender === 'user'
                      ? 'bg-brand-accent text-white rounded-br-none'
                      : 'bg-brand-dark border border-brand-border text-brand-paper rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="text-[10px] text-brand-gold italic flex items-center space-x-1">
                <span>Panda AI is thinking...</span>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-2 border-t border-brand-border bg-brand-dark flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about ramen, spicy dishes, prices..."
              className="flex-1 bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-gold"
            />
            <button
              type="submit"
              className="p-2 bg-brand-gold hover:bg-amber-600 text-black font-bold rounded-xl"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
