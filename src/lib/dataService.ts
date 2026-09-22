import {
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  StockItem,
  LoyaltyAccount,
  Feedback,
  ActivityLog,
  FeatureFlags,
  RestaurantSettings,
  Address,
  Profile
} from './types';

// Initial Seed Data for Panda Wok
let categories: MenuCategory[] = [
  { id: 'cat-1', slug: 'wok', name_en: 'Signature Wok', name_ar: 'واك فاخر', description_en: 'Flame-seared wok dishes with authentic sauces.', description_ar: 'أطباق الواك المطهوة على نار عالية مع الصوصات الأصلية.', sort_order: 1, is_enabled: true },
  { id: 'cat-2', slug: 'ramen', name_en: 'Craft Ramen', name_ar: 'رامن ياباني', description_en: 'Rich slow-simmered rich broth with fresh wheat noodles.', description_ar: 'حساء الرامن الغني المطهو ببطء مع نودلز القمح الطازجة.', sort_order: 2, is_enabled: true },
  { id: 'cat-3', slug: 'sushi', name_en: 'Artisanal Sushi', name_ar: 'سوشي احترافي', description_en: 'Fresh sushi rolls and nigiri prepared with Japanese technique.', description_ar: 'رولات السوشي الطازجة والنيجيري المحضرة بالطريقة اليابانية.', sort_order: 3, is_enabled: true },
  { id: 'cat-4', slug: 'appetizers', name_en: 'Izakaya Sides', name_ar: 'مقبلات إيزاكايا', description_en: 'Crispy gyoza, dim sum and Asian street appetizers.', description_ar: 'جايوزا مقرمشة، ديم سم ومقبلات الآسيوية.', sort_order: 4, is_enabled: true },
];

let stockItems: StockItem[] = [
  { id: 'stk-1', name: 'Fresh Egg Noodles', unit: 'kg', quantity: 45, min_threshold: 10, status: 'IN_STOCK', updated_at: new Date().toISOString() },
  { id: 'stk-2', name: 'Chicken Breast Cutlets', unit: 'kg', quantity: 30, min_threshold: 8, status: 'IN_STOCK', updated_at: new Date().toISOString() },
  { id: 'stk-3', name: 'Sushi Grade Salmon', unit: 'kg', quantity: 12, min_threshold: 5, status: 'IN_STOCK', updated_at: new Date().toISOString() },
  { id: 'stk-4', name: 'Tonkotsu Ramen Broth', unit: 'liters', quantity: 3, min_threshold: 10, status: 'LOW_STOCK', updated_at: new Date().toISOString() },
  { id: 'stk-5', name: 'Pork Flank / Beef Fillet', unit: 'kg', quantity: 20, min_threshold: 5, status: 'IN_STOCK', updated_at: new Date().toISOString() },
];

let menuItems: MenuItem[] = [
  {
    id: 'item-1',
    slug: 'dragon-chicken-wok',
    category_id: 'cat-1',
    name_en: 'Dragon Chicken Wok',
    name_ar: 'دجاج الدراغون واك',
    name_jp: 'ドラゴンチキン',
    description_en: 'Crispy tender chicken stir-fried with bell peppers, chili pods, and caramelized dark soy glaze.',
    description_ar: 'دجاج مقرمش مع فلفل ألوان، فلفل حار، وصوص الصويا المكرمل.',
    price: 195,
    image_url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80',
    transparent_png: true,
    is_available: true,
    is_featured: true,
    is_spicy: true,
    is_vegetarian: false,
    stock_item_id: 'stk-2',
    sort_order: 1,
    seo_title: 'Dragon Chicken Wok | Panda Wok Alexandria',
    seo_description: 'Order authentic Dragon Chicken Wok delivered hot in Alexandria. Spicy flame-seared chicken with dark glaze.'
  },
  {
    id: 'item-2',
    slug: 'tokyo-shoyu-ramen',
    category_id: 'cat-2',
    name_en: 'Tokyo Shoyu Ramen',
    name_ar: 'رامن شوكيو طوكيو',
    name_jp: '東京醤油ラーメン',
    description_en: 'Savory soy broth, tender braised beef, ajitsuke tamago egg, bamboo shoots, and scallions.',
    description_ar: 'حساء الصويا الغني، لحم بقر مطهو ببطء، بيض متبل، براعم الخيزران والبصل الأخضر.',
    price: 220,
    image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80',
    transparent_png: true,
    is_available: true,
    is_featured: true,
    is_spicy: false,
    is_vegetarian: false,
    stock_item_id: 'stk-1',
    sort_order: 2,
    seo_title: 'Tokyo Shoyu Ramen | Panda Wok Alexandria',
    seo_description: 'Authentic Japanese Tokyo Shoyu Ramen in Alexandria. Rich broth with fresh noodles.'
  },
  {
    id: 'item-3',
    slug: 'spicy-salmon-volcano-roll',
    category_id: 'cat-3',
    name_en: 'Spicy Salmon Volcano Roll (8 pcs)',
    name_ar: 'سالمون بركان سبايسي رول',
    name_jp: 'スパイシーサーモン火山',
    description_en: 'Fresh salmon roll topped with seared spicy salmon tartar, unagi sauce, and crispy tanuki flakes.',
    description_ar: 'رول السالمون الطازج يعلوه تار تار السالمون الحار المطهو ببطء، صوص أوناجي ورائق التانكوان المقرمشة.',
    price: 245,
    image_url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&auto=format&fit=crop&q=80',
    transparent_png: false,
    is_available: true,
    is_featured: true,
    is_spicy: true,
    is_vegetarian: false,
    stock_item_id: 'stk-3',
    sort_order: 3,
    seo_title: 'Spicy Salmon Volcano Roll | Panda Wok Alexandria',
    seo_description: 'Fresh artisanal Spicy Salmon Volcano Roll sushi in Alexandria.'
  },
  {
    id: 'item-4',
    slug: 'crispy-prawn-gyoza',
    category_id: 'cat-4',
    name_en: 'Pan-Seared Prawn Gyoza (5 pcs)',
    name_ar: 'جايوزا الجمبري المقرمشة',
    name_jp: '海老餃子',
    description_en: 'Handmade Asian dumplings stuffed with minced prawns, ginger, and scallions served with sesame ponzu.',
    description_ar: 'دمبلنجز آسيوية محشوة بالجمبري المفروم، الزنجبيل والبصل الأخضر تقدم مع صوص البونزو.',
    price: 150,
    image_url: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80',
    transparent_png: true,
    is_available: true,
    is_featured: false,
    is_spicy: false,
    is_vegetarian: false,
    sort_order: 4,
    seo_title: 'Pan-Seared Prawn Gyoza | Panda Wok Alexandria',
    seo_description: 'Handmade pan-seared prawn gyoza in Alexandria, Egypt.'
  }
];

let orders: Order[] = [
  {
    id: 'ord-1001',
    order_number: 1001,
    user_id: 'usr-1',
    customer_name: 'Omar Hassan',
    customer_phone: '+201012345678',
    delivery_address: {
      id: 'addr-1',
      title: 'Home',
      street: 'Fouad Street, Kafr Abdo',
      building: 'Bldg 14',
      floor: '3rd Floor',
      apartment: 'Apt 302',
      landmark: 'Near St. Mark College',
      city: 'Alexandria',
      delivery_notes: 'Ring the doorbell please'
    },
    status: 'IN_PROGRESS',
    subtotal: 415,
    delivery_fee: 30,
    discount: 0,
    total: 445,
    payment_method: 'CASH_ON_DELIVERY',
    notes: 'Make it extra spicy please!',
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(), // 20 mins ago
    items: [
      { menu_item_id: 'item-1', item_name: 'Dragon Chicken Wok', unit_price: 195, quantity: 1, subtotal: 195 },
      { menu_item_id: 'item-2', item_name: 'Tokyo Shoyu Ramen', unit_price: 220, quantity: 1, subtotal: 220 }
    ]
  }
];

let feedbackList: Feedback[] = [
  {
    id: 'fb-1',
    user_id: 'usr-1',
    order_id: 'ord-1001',
    rating: 5,
    category: 'FOOD_QUALITY',
    comment: 'The Dragon Chicken Wok was smoky and hot! Best Asian food in Alexandria.',
    status: 'REVIEWED',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  }
];

let activityLogs: ActivityLog[] = [
  {
    id: 'act-1',
    user_id: 'usr-1',
    action: 'ORDER_CREATED',
    metadata: { order_id: 'ord-1001', amount: 445 },
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString()
  }
];

let featureFlags: FeatureFlags = {
  menu: true,
  ordering: true,
  reservations: false,
  feedback: true,
  loyalty: true,
  tracking: true,
  ai_assistant: true,
  broadcast: true
};

let restaurantSettings: RestaurantSettings = {
  name: 'Panda Wok',
  tagline: 'Handcrafted Asian Cloud Kitchen',
  phone: '+20 100 000 1234',
  whatsapp: '+20 100 000 1234',
  address_en: 'Kafr Abdo, Alexandria, Egypt',
  address_ar: 'كفر عبده، الإسكندرية، مصر',
  city: 'Alexandria',
  country: 'Egypt',
  opening_hours: '12:00 PM - 02:00 AM Daily',
  facebook: 'https://facebook.com/pandawok.eg',
  instagram: 'https://instagram.com/pandawok.eg',
  loyalty_points_per_egp: 0.1, // 10 EGP spent = 1 Point
  loyalty_redemption_rate: 10 // 10 Points = 1 EGP discount
};

export class DataService {
  // CATEGORIES
  static async getCategories(): Promise<MenuCategory[]> {
    return categories.filter(c => c.is_enabled).sort((a, b) => a.sort_order - b.sort_order);
  }

  static async getAllCategoriesAdmin(): Promise<MenuCategory[]> {
    return [...categories].sort((a, b) => a.sort_order - b.sort_order);
  }

  static async saveCategory(cat: Partial<MenuCategory>): Promise<MenuCategory> {
    if (cat.id) {
      const idx = categories.findIndex(c => c.id === cat.id);
      if (idx !== -1) {
        categories[idx] = { ...categories[idx], ...cat };
        return categories[idx];
      }
    }
    const newCat: MenuCategory = {
      id: `cat-${Date.now()}`,
      slug: cat.slug || `cat-${Date.now()}`,
      name_en: cat.name_en || 'New Category',
      name_ar: cat.name_ar || 'تصنيف جديد',
      description_en: cat.description_en,
      description_ar: cat.description_ar,
      sort_order: cat.sort_order || categories.length + 1,
      is_enabled: cat.is_enabled ?? true
    };
    categories.push(newCat);
    return newCat;
  }

  // MENU ITEMS
  static async getMenuItems(): Promise<MenuItem[]> {
    return menuItems.filter(item => item.is_available);
  }

  static async getAllMenuItemsAdmin(): Promise<MenuItem[]> {
    return [...menuItems];
  }

  static async getMenuItemBySlug(slug: string): Promise<MenuItem | null> {
    return menuItems.find(i => i.slug === slug) || null;
  }

  static async saveMenuItem(item: Partial<MenuItem>): Promise<MenuItem> {
    if (item.id) {
      const idx = menuItems.findIndex(m => m.id === item.id);
      if (idx !== -1) {
        menuItems[idx] = { ...menuItems[idx], ...item };
        return menuItems[idx];
      }
    }
    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      slug: item.slug || `item-${Date.now()}`,
      category_id: item.category_id || categories[0]?.id || '',
      name_en: item.name_en || 'New Dish',
      name_ar: item.name_ar || 'طبق جديد',
      name_jp: item.name_jp,
      description_en: item.description_en || '',
      description_ar: item.description_ar || '',
      price: item.price || 100,
      image_url: item.image_url || 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80',
      transparent_png: item.transparent_png ?? false,
      is_available: item.is_available ?? true,
      is_featured: item.is_featured ?? false,
      is_spicy: item.is_spicy ?? false,
      is_vegetarian: item.is_vegetarian ?? false,
      stock_item_id: item.stock_item_id,
      sort_order: item.sort_order || menuItems.length + 1,
      seo_title: item.seo_title,
      seo_description: item.seo_description
    };
    menuItems.push(newItem);
    return newItem;
  }

  // ORDERS
  static async createOrder(orderPayload: {
    customer_name: string;
    customer_phone: string;
    delivery_address: Address;
    items: { menu_item_id: string; quantity: number }[];
    notes?: string;
    idempotency_key?: string;
  }): Promise<Order> {
    // Idempotency check
    if (orderPayload.idempotency_key) {
      const existing = orders.find(o => o.idempotency_key === orderPayload.idempotency_key);
      if (existing) return existing;
    }

    // Validate prices server-side
    let calculatedSubtotal = 0;
    const validatedItems = orderPayload.items.map(reqItem => {
      const dbItem = menuItems.find(m => m.id === reqItem.menu_item_id);
      if (!dbItem || !dbItem.is_available) {
        throw new Error(`Item ${reqItem.menu_item_id} is unavailable or out of stock.`);
      }
      const itemSubtotal = dbItem.price * reqItem.quantity;
      calculatedSubtotal += itemSubtotal;
      return {
        menu_item_id: dbItem.id,
        item_name: dbItem.name_en,
        unit_price: dbItem.price,
        quantity: reqItem.quantity,
        subtotal: itemSubtotal
      };
    });

    const deliveryFee = 30;
    const total = calculatedSubtotal + deliveryFee;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      order_number: orders.length + 1002,
      customer_name: orderPayload.customer_name,
      customer_phone: orderPayload.customer_phone,
      delivery_address: orderPayload.delivery_address,
      status: 'NEW',
      subtotal: calculatedSubtotal,
      delivery_fee: deliveryFee,
      discount: 0,
      total: total,
      payment_method: 'CASH_ON_DELIVERY',
      notes: orderPayload.notes,
      idempotency_key: orderPayload.idempotency_key,
      created_at: new Date().toISOString(),
      items: validatedItems
    };

    orders.unshift(newOrder);

    // Log Activity
    this.logActivity('ORDER_CREATED', { order_id: newOrder.id, amount: total });

    return newOrder;
  }

  static async getOrderById(id: string): Promise<Order | null> {
    return orders.find(o => o.id === id || String(o.order_number) === id) || null;
  }

  static async getAllOrdersAdmin(): Promise<Order[]> {
    return [...orders];
  }

  static async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;
    order.status = status;
    this.logActivity('ORDER_STATUS_CHANGED', { order_id: orderId, new_status: status });
    return order;
  }

  // STOCK MANAGEMENT
  static async getStockItems(): Promise<StockItem[]> {
    return [...stockItems];
  }

  static async updateStockQuantity(id: string, quantity: number): Promise<StockItem | null> {
    const item = stockItems.find(s => s.id === id);
    if (!item) return null;
    item.quantity = quantity;
    item.status = quantity <= 0 ? 'OUT_OF_STOCK' : quantity <= item.min_threshold ? 'LOW_STOCK' : 'IN_STOCK';
    item.updated_at = new Date().toISOString();

    // Auto-disable linked menu items if stock is 0
    if (quantity <= 0) {
      menuItems.forEach(m => {
        if (m.stock_item_id === id) {
          m.is_available = false;
        }
      });
    }
    return item;
  }

  // FEEDBACK
  static async submitFeedback(fb: Omit<Feedback, 'id' | 'created_at' | 'status'>): Promise<Feedback> {
    const newFb: Feedback = {
      ...fb,
      id: `fb-${Date.now()}`,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };
    feedbackList.unshift(newFb);
    return newFb;
  }

  static async getAllFeedback(): Promise<Feedback[]> {
    return [...feedbackList];
  }

  // SETTINGS & FEATURE FLAGS
  static async getFeatureFlags(): Promise<FeatureFlags> {
    return { ...featureFlags };
  }

  static async updateFeatureFlags(flags: Partial<FeatureFlags>): Promise<FeatureFlags> {
    featureFlags = { ...featureFlags, ...flags };
    return featureFlags;
  }

  static async getRestaurantSettings(): Promise<RestaurantSettings> {
    return { ...restaurantSettings };
  }

  static async updateRestaurantSettings(settings: Partial<RestaurantSettings>): Promise<RestaurantSettings> {
    restaurantSettings = { ...restaurantSettings, ...settings };
    return restaurantSettings;
  }

  // LOGS
  static logActivity(action: string, metadata?: Record<string, unknown>) {
    activityLogs.unshift({
      id: `act-${Date.now()}`,
      action,
      metadata,
      created_at: new Date().toISOString()
    });
  }

  static async getActivityLogs(): Promise<ActivityLog[]> {
    return [...activityLogs];
  }
}
