import { MenuItem, MenuCategory, RestaurantSettings } from './types';

export function generateRestaurantJsonLd(settings: RestaurantSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    'name': settings.name,
    'description': settings.tagline,
    'image': 'https://pandawok.eg/og-image.jpg',
    'telephone': settings.phone,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': settings.address_en,
      'addressLocality': settings.city,
      'addressCountry': settings.country
    },
    'geo': {
      '@type': 'GeoCoordinates',
      'latitude': 31.2001,
      'longitude': 29.9187
    },
    'servesCuisine': ['Asian', 'Japanese', 'Chinese', 'Ramen', 'Sushi', 'Wok'],
    'priceRange': '$$',
    'openingHours': 'Mo-Su 12:00-02:00',
    'url': 'https://pandawok.eg',
    'menu': 'https://pandawok.eg/menu'
  };
}

export function generateMenuJsonLd(categories: MenuCategory[], items: MenuItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    'name': 'Panda Wok Menu',
    'description': 'Handcrafted Asian Cloud Kitchen Menu in Alexandria, Egypt',
    'hasMenuSection': categories.map(cat => ({
      '@type': 'MenuSection',
      'name': cat.name_en,
      'description': cat.description_en,
      'hasMenuItem': items
        .filter(item => item.category_id === cat.id)
        .map(item => ({
          '@type': 'MenuItem',
          'name': item.name_en,
          'description': item.description_en,
          'offers': {
            '@type': 'Offer',
            'price': item.price,
            'priceCurrency': 'EGP',
            'availability': item.is_available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
          }
        }))
    }))
  };
}

export function generateMenuItemJsonLd(item: MenuItem) {
  return {
    '@context': 'https://schema.org',
    '@type': 'MenuItem',
    'name': item.name_en,
    'alternateName': item.name_jp || item.name_ar,
    'description': item.description_en,
    'image': item.image_url,
    'offers': {
      '@type': 'Offer',
      'price': item.price,
      'priceCurrency': 'EGP',
      'availability': item.is_available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    }
  };
}

export function generateBreadcrumbJsonLd(items: { name: string; item: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((b, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': b.name,
      'item': `https://pandawok.eg${b.item}`
    }))
  };
}
