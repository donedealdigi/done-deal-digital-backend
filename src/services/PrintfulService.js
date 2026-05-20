/**
 * PrintfulService — thin axios-based client for the Printful REST API.
 * Used for fetching product catalog and submitting fulfillment orders.
 *
 * Auth: PRINTFUL_API_KEY env var (stored in AWS Secrets Manager).
 * Optional: PRINTFUL_STORE_ID to scope the client to a specific store.
 * Docs: https://developers.printful.com/docs/
 */

const axios = require('axios');

const BASE_URL = 'https://api.printful.com';
const TIMEOUT_MS = 15000;

let cachedClient = null;
function client() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    throw new Error('PRINTFUL_API_KEY not configured');
  }
  cachedClient = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  // Optional: scope to store
  if (process.env.PRINTFUL_STORE_ID) {
    cachedClient.defaults.headers['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  }
  return cachedClient;
}

function unwrap(res) {
  if (res.data && typeof res.data.code === 'number') {
    if (res.data.code >= 400) {
      const msg = res.data.error?.message || res.data.result || 'Printful API error';
      const err = new Error(`Printful ${res.data.code}: ${msg}`);
      err.printful = res.data;
      throw err;
    }
    return res.data.result;
  }
  return res.data;
}

// In-memory cache for the catalog list (5 min TTL) — Printful API is slow & rate-limited.
let listCache = { ts: 0, data: null };
const LIST_CACHE_MS = 5 * 60 * 1000;

class PrintfulService {
  static async listSyncProducts({ force = false } = {}) {
    const now = Date.now();
    if (!force && listCache.data && (now - listCache.ts) < LIST_CACHE_MS) {
      return listCache.data;
    }
    const res = await client().get('/sync/products', { params: { limit: 100 } });
    const result = unwrap(res) || [];
    listCache = { ts: now, data: result };
    return result;
  }

  static async getSyncProduct(syncProductId) {
    if (!syncProductId) throw new Error('syncProductId required');
    const res = await client().get(`/sync/products/${syncProductId}`);
    return unwrap(res);
  }

  /**
   * Calculate shipping rates for a given recipient + items list.
   * recipient: { address1, city, state_code, country_code, zip }
   * items: [{ sync_variant_id, quantity }]
   */
  static async getShippingRates({ recipient, items }) {
    if (!recipient || !items || !items.length) {
      throw new Error('recipient + items required');
    }
    const res = await client().post('/shipping/rates', { recipient, items });
    return unwrap(res);
  }

  /**
   * Calculate order tax (Printful built-in tax calculation).
   */
  static async calculateTax({ recipient }) {
    const res = await client().post('/tax/rates', { recipient });
    return unwrap(res);
  }

  /**
   * Submit an order for fulfillment.
   * recipient: shipping address
   * items: [{ sync_variant_id, quantity, retail_price?, name? }]
   * external_id: our internal order id (so we can correlate later)
   * confirm: if true, order goes straight to fulfillment; if false, sits as draft
   */
  static async createOrder({ recipient, items, external_id, retail_costs, confirm = true }) {
    const payload = {
      external_id,
      recipient,
      items,
      retail_costs
    };
    const res = await client().post(`/orders?confirm=${confirm ? 1 : 0}`, payload);
    return unwrap(res);
  }

  static async getOrder(orderId) {
    const res = await client().get(`/orders/${orderId}`);
    return unwrap(res);
  }

  static async cancelOrder(orderId) {
    const res = await client().delete(`/orders/${orderId}`);
    return unwrap(res);
  }
}

module.exports = PrintfulService;
