/**
 * Sales tax calculation.
 *
 * Done Deal Digital LLC is based in California, so we have physical
 * nexus there and are required to collect CA sales tax on tangible
 * goods (merch) shipped to CA addresses.
 *
 * For other states, we only need to collect once we cross their
 * economic-nexus threshold (typically $100k/yr or 200 transactions).
 * Add entries below as the business expands and registers in each
 * state.
 *
 * Important: services + digital goods are NOT taxed at this point.
 * CA does not tax services or digital products. Only physical merch
 * is taxable.
 *
 * The rates here are state base + estimated average district.
 * For precise local-rate accuracy, switch to Stripe Tax (~$0.005 per
 * transaction) later.
 */

const TAX_TABLE = {
  US: {
    // California: 7.25% state + ~2% average district = ~9.25% statewide average
    CA: { rate: 0.0925, label: 'CA Sales Tax', shippingTaxable: false }
    // To add a state when nexus is reached:
    //   NY: { rate: 0.08, label: 'NY Sales Tax', shippingTaxable: true }
  }
};

/**
 * Calculate tax for a given shipping address + subtotal.
 *
 * @param {object} params
 * @param {string} params.countryCode  e.g. "US"
 * @param {string} params.stateCode    e.g. "CA"
 * @param {number} params.subtotal     pre-tax merchandise total
 * @param {number} params.shippingCost shipping cost (only taxed if shippingTaxable)
 * @returns {{ rate: number, amount: number, label: string|null }}
 */
function calculateTax({ countryCode, stateCode, subtotal, shippingCost = 0 }) {
  if (!countryCode || !stateCode) return { rate: 0, amount: 0, label: null };

  const country = TAX_TABLE[String(countryCode).toUpperCase()] || null;
  if (!country) return { rate: 0, amount: 0, label: null };

  const entry = country[String(stateCode).toUpperCase()] || null;
  if (!entry) return { rate: 0, amount: 0, label: null };

  const taxableBase = entry.shippingTaxable
    ? (Number(subtotal) || 0) + (Number(shippingCost) || 0)
    : (Number(subtotal) || 0);

  const amount = Math.round(taxableBase * entry.rate * 100) / 100;
  return {
    rate: entry.rate,
    amount,
    label: entry.label
  };
}

module.exports = { calculateTax };
