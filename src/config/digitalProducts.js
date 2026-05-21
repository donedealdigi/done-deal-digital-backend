/**
 * Digital products catalog.
 *
 * Maps a service-deposit `service_slug` to the S3-hosted file that should be
 * auto-delivered when the purchase is paid.
 *
 * To add a new digital product:
 *   1. Upload the file to S3:
 *        donedealdigital-clientfiles/digital-products/<filename>
 *   2. Add an entry below.
 *   3. Add a matching pricing card on the frontend with
 *        data-deposit-slug="<the slug>"
 *        data-deposit-type="digital"
 *
 * The catalog is intentionally not stored in the DB — it changes rarely,
 * and keeping it in code means the source of truth is the deploy.
 */

const CATALOG = {
  'college-radio-playbook': {
    name: 'The College Radio Playbook',
    description: 'Complete guide to pitching college radio stations — station lists, email templates, follow-up cadence, and what gets you spins.',
    price: 29,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/college-radio-playbook.pdf',
    filename: 'Done-Deal-Digital-College-Radio-Playbook.pdf',
    contentType: 'application/pdf',
    category: 'guide'
  }
};

function get(slug) {
  if (!slug) return null;
  return CATALOG[slug] || null;
}

function list() {
  return Object.entries(CATALOG).map(([slug, p]) => ({
    slug,
    name: p.name,
    description: p.description,
    price: p.price,
    category: p.category,
    contentType: p.contentType
  }));
}

module.exports = { get, list };
