'use client';

import React, { useState } from 'react';
import { NavigationBar } from '@/components/NavigationBar';
import { DataService } from '@/lib/dataService';
import { Star, MessageSquare, Send, CheckCircle2 } from 'lucide-react';

export default function FeedbackPage() {
  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState<'FOOD_QUALITY' | 'DELIVERY' | 'SERVICE' | 'GENERAL'>('FOOD_QUALITY');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await DataService.submitFeedback({
      rating,
      category,
      comment
    });
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-brand-dark pb-28 text-brand-paper">
      <NavigationBar />

      <div className="p-4 max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-extrabold tracking-wide mb-1 flex items-center space-x-2">
          <MessageSquare className="w-6 h-6 text-brand-accent" />
          <span>Kitchen Feedback</span>
        </h1>
        <p className="text-xs text-brand-muted">Share your dining experience directly with Panda Wok chefs.</p>

        {submitted ? (
          <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-brand-bamboo mx-auto" />
            <h2 className="text-lg font-bold">Thank You for Your Feedback!</h2>
            <p className="text-xs text-brand-muted">Our culinary team reviews all customer notes to maintain dish quality.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-brand-gold mb-2">Overall Rating</label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-gold mb-1">Feedback Category</label>
              <select
                value={category}
                onChange={(e: any) => setCategory(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent"
              >
                <option value="FOOD_QUALITY">Food Quality & Taste</option>
                <option value="DELIVERY">Delivery Speed & Packaging</option>
                <option value="SERVICE">Customer Support Service</option>
                <option value="GENERAL">General Experience</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-gold mb-1">Your Comments</label>
              <textarea
                required
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us about the wok flavor, noodles texture, or delivery experience..."
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-3 py-2 text-xs text-brand-paper focus:outline-none focus:border-brand-accent resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 bg-brand-accent hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-brand-accent/20 flex items-center justify-center space-x-2 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Submit Kitchen Feedback</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
