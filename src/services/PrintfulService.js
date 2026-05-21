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
   *
   * NOTE: Printful's /shipping/rates endpoint requires `variant_id` (the
   * Printful catalog ID), not `sync_variant_id` (the store-specific ID).
   * The /orders endpoint accepts both, but shipping/rates is stricter.
   * We translate by looking up each sync_variant in the cached product
   * list and pulling its underlying `variant_id`.
   */
  static async getShippingRates({ recipient, items }) {
    if (!recipient || !items || !items.length) {
      throw new Error('recipient + items required');
    }

    // Build a sync_variant_id -> variant_id map from the cached sync products.
    const products = await PrintfulService.listSyncProducts();
    const variantMap = new Map();
    for (const p of products || []) {
      // Each sync product has a variants count but not the underlying
      // variant_ids; we need to fetch detail. Use a small parallel batch.
    }

    // Quick path: fetch product details in parallel for unique products that
    // contain the sync_variant_ids we need. We don't know which product a
    // sync_variant belongs to, so fetch all products we have (typically 1-3
    // for a small storefront).
    const productDetails = await Promise.all(
      (products || []).map(p => PrintfulService.getSyncProduct(p.id).catch(() => null))
    );
    for (const detail of productDetails) {
      if (!detail || !detail.sync_variants) continue;
      for (const sv of detail.sync_variants) {
        variantMap.set(String(sv.id), sv.variant_id);
      }
    }

    const translated = items.map(it => {
      const cv = variantMap.get(String(it.sync_variant_id));
      if (!cv) {
        throw new Error(`Unknown sync_variant_id ${it.sync_variant_id} — not in store catalog`);
      }
      return { variant_id: cv, quantity: it.quantity };
    });

    const res = await client().post('/shipping/rates', { recipient, items: translated });
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
