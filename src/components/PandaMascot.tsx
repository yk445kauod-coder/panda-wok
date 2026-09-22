'use client';

import React, { useState } from 'react';
import { Sparkles, MessageCircle, X } from 'lucide-react';

export type MascotState = 'idle' | 'blinking' | 'thinking' | 'speaking' | 'recommending';

interface PandaMascotProps {
  onOpenAssistant?: () => void;
}

export function PandaMascot({ onOpenAssistant }: PandaMascotProps) {
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [speechBubble, setSpeechBubble] = useState<string | null>('Craving Dragon Chicken Wok? 🥟');

  const handleTap = () => {
    setMascotState('speaking');
    setSpeechBubble('Hello! I am Panda Wok Chef. Tap me for menu tips!');
    if (onOpenAssistant) {
      onOpenAssistant();
    }
  };

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col items-end pointer-events-auto">
      {/* Speech Bubble */}
      {speechBubble && (
        <div className="mb-2 max-w-[200px] bg-brand-card border border-brand-gold/40 text-brand-paper text-xs p-3 rounded-2xl shadow-xl relative animate-bounce flex items-center justify-between space-x-2">
          <span>{speechBubble}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSpeechBubble(null);
            }}
            className="text-brand-muted hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Animated Mascot Button */}
      <button
        onClick={handleTap}
        className="relative group p-3 rounded-full bg-gradient-to-br from-brand-card to-zinc-900 border-2 border-brand-gold/60 shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300"
        aria-label="Panda AI Assistant"
      >
        <div className="text-3xl select-none animate-pulse">
          🐼
        </div>

        {/* Status Badge */}
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-accent"></span>
        </span>
      </button>
    </div>
  );
}
