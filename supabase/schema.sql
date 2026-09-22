-- Panda Wok Cloud Kitchen Supabase Schema Definition

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES / USERS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('owner', 'admin', 'manager', 'kitchen', 'support', 'marketing', 'customer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADDRESSES
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Home',
  street TEXT NOT NULL,
  building TEXT,
  floor TEXT,
  apartment TEXT,
  landmark TEXT,
  city TEXT DEFAULT 'Alexandria',
  delivery_notes TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENU CATEGORIES
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  sort_order INT DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STOCK ITEMS
CREATE TABLE IF NOT EXISTS public.stock_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg', -- kg, pcs, liters, packs
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_threshold DECIMAL(10,2) NOT NULL DEFAULT 5,
  status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN quantity <= 0 THEN 'OUT_OF_STOCK'
      WHEN quantity <= min_threshold THEN 'LOW_STOCK'
      ELSE 'IN_STOCK'
    END
  ) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENU ITEMS
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_jp TEXT,
  description_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT NOT NULL,
  transparent_png BOOLEAN DEFAULT FALSE,
  is_available BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  is_spicy BOOLEAN DEFAULT FALSE,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL UNIQUE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CHECKED', 'IN_PROGRESS', 'PREPARED', 'OUT_FOR_DELIVERY', 'FINISHED', 'CANCELED', 'REJECTED')),
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 30.00,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'CASH_ON_DELIVERY',
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER STATUS HISTORY
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOYALTY ACCOUNTS
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  points INT DEFAULT 0,
  tier TEXT DEFAULT 'BRONZE' CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD', 'DRAGON')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOYALTY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loyalty_account_id UUID REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  points_delta INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EARNED_ORDER', 'REDEEMED', 'BONUS', 'EXPIRED')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FEEDBACK
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category TEXT DEFAULT 'FOOD_QUALITY' CHECK (category IN ('FOOD_QUALITY', 'DELIVERY', 'SERVICE', 'GENERAL')),
  comment TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'RESOLVED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS & CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BROADCASTS
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_segment TEXT DEFAULT 'ALL',
  recipient_count INT DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI REQUEST LOGS
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT,
  response TEXT,
  tokens_used INT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PLATFORM SETTINGS & FEATURE FLAGS
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) Enable
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
