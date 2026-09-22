// Panda Wok Data Types & Database Schema Interfaces

export type UserRole = 'owner' | 'admin' | 'manager' | 'kitchen' | 'support' | 'marketing' | 'customer';

export interface Profile {
  id: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
}

export interface Address {
  id: string;
  user_id?: string;
  title: string;
  street: string;
  building?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  city: string;
  delivery_notes?: string;
  is_default?: boolean;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  sort_order: number;
  is_enabled: boolean;
}

export interface StockItem {
  id: string;
  name: string;
  unit: 'kg' | 'pcs' | 'liters' | 'packs';
  quantity: number;
  min_threshold: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  updated_at: string;
}

export interface MenuItem {
  id: string;
  slug: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  name_jp?: string;
  description_en: string;
  description_ar: string;
  price: number;
  image_url: string;
  transparent_png: boolean;
  is_available: boolean;
  is_featured: boolean;
  is_spicy: boolean;
  is_vegetarian: boolean;
  stock_item_id?: string;
  sort_order: number;
  seo_title?: string;
  seo_description?: string;
  created_at?: string;
}

export type OrderStatus = 'NEW' | 'CHECKED' | 'IN_PROGRESS' | 'PREPARED' | 'OUT_FOR_DELIVERY' | 'FINISHED' | 'CANCELED' | 'REJECTED';

export interface OrderItem {
  id?: string;
  order_id?: string;
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  order_number: number;
  user_id?: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: Address;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  payment_method: string;
  notes?: string;
  idempotency_key?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface LoyaltyAccount {
  id: string;
  user_id: string;
  points: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'DRAGON';
  created_at: string;
}

export interface Feedback {
  id: string;
  user_id?: string;
  order_id?: string;
  rating: number;
  category: 'FOOD_QUALITY' | 'DELIVERY' | 'SERVICE' | 'GENERAL';
  comment?: string;
  image_url?: string;
  status: 'PENDING' | 'REVIEWED' | 'RESOLVED';
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface FeatureFlags {
  menu: boolean;
  ordering: boolean;
  reservations: boolean;
  feedback: boolean;
  loyalty: boolean;
  tracking: boolean;
  ai_assistant: boolean;
  broadcast: boolean;
}

export interface RestaurantSettings {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  address_en: string;
  address_ar: string;
  city: string;
  country: string;
  opening_hours: string;
  facebook: string;
  instagram: string;
  loyalty_points_per_egp: number; // e.g., 1 point per 10 EGP
  loyalty_redemption_rate: number; // e.g., 10 points = 1 EGP
}
