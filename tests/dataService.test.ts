import { describe, it, expect, beforeEach } from 'vitest';
import { DataService } from '../src/lib/dataService';

describe('Panda Wok Business & Data Logic', () => {
  it('should calculate server-side order prices correctly', async () => {
    const items = await DataService.getMenuItems();
    const testItem = items[0];

    const order = await DataService.createOrder({
      customer_name: 'Test Customer',
      customer_phone: '+201000000000',
      delivery_address: {
        id: 'addr-test',
        title: 'Home',
        street: 'Test Street',
        city: 'Alexandria'
      },
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    });

    const expectedSubtotal = testItem.price * 2;
    expect(order.subtotal).toBe(expectedSubtotal);
    expect(order.total).toBe(expectedSubtotal + 30); // 30 EGP delivery fee
  });

  it('should prevent duplicate order submissions using idempotency key', async () => {
    const key = `idemp-test-${Date.now()}`;
    const items = await DataService.getMenuItems();

    const order1 = await DataService.createOrder({
      customer_name: 'Duplicate Test',
      customer_phone: '+201000000000',
      delivery_address: { id: 'addr-1', title: 'Home', street: 'Street 1', city: 'Alexandria' },
      items: [{ menu_item_id: items[0].id, quantity: 1 }],
      idempotency_key: key
    });

    const order2 = await DataService.createOrder({
      customer_name: 'Duplicate Test',
      customer_phone: '+201000000000',
      delivery_address: { id: 'addr-1', title: 'Home', street: 'Street 1', city: 'Alexandria' },
      items: [{ menu_item_id: items[0].id, quantity: 1 }],
      idempotency_key: key
    });

    expect(order1.id).toBe(order2.id);
  });

  it('should automatically disable linked menu item when stock reaches zero', async () => {
    const stock = await DataService.getStockItems();
    const targetStock = stock[0];

    await DataService.updateStockQuantity(targetStock.id, 0);

    const items = await DataService.getAllMenuItemsAdmin();
    const linkedItem = items.find(i => i.stock_item_id === targetStock.id);

    if (linkedItem) {
      expect(linkedItem.is_available).toBe(false);
    }
  });
});
