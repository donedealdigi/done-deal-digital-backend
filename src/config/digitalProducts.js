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
  },
  'down-4-the-cause': {
    name: 'Down 4 The Cause',
    description: 'The Fast 1 — 1995 Bay Area debut album. Rare Bay Area gem with standout cuts "Wake Up," "Freak Da Fonk," and "Landed On a Mill Ticket."',
    price: 14.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/down-4-the-cause.wav',
    filename: 'The-Fast-1-Down-4-The-Cause.wav',
    contentType: 'audio/wav',
    category: 'album'
  },
  'straight-maxn': {
    name: "Straight Max'n",
    description: "Tha Dangla — 1996 LP, Executive Produced by Feady Crocka. 12-track WAV album (lossless 16-bit/44.1kHz masters).",
    price: 14.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/straight-maxn.zip',
    filename: "Tha-Dangla-Straight-Maxn.zip",
    contentType: 'application/zip',
    category: 'album'
  },
  'servin-ep': {
    name: 'Servin EP',
    description: 'Spendoe — 5-track EP featuring The Jacka. Lossless WAV masters.',
    price: 9.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/servin-ep.zip',
    filename: 'Spendoe-Servin-EP.zip',
    contentType: 'application/zip',
    category: 'ep'
  },
  'huh-whaaat': {
    name: 'Huh Whaaat',
    description: "Adry'Anna Couture — single, 2:57. 320 kbps MP3 master.",
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/huh-whaaat.mp3',
    filename: 'AdryAnna-Couture-Huh-Whaaat.mp3',
    contentType: 'audio/mpeg',
    category: 'single'
  },
  'spendoe-to-the-top': {
    name: 'To The Top',
    description: 'Spendoe — single, 2:48. Lossless 16-bit/44.1kHz WAV master. Produced by Done Deal Digital.',
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/spendoe-to-the-top.wav',
    filename: 'Spendoe-To-The-Top.wav',
    contentType: 'audio/wav',
    category: 'single'
  },
  'f-train-to-queens': {
    name: 'F Train to Queens',
    description: 'Mr. Freejack — single. MP3 master.',
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/f-train-to-queens.mp3',
    filename: 'Mr-Freejack-F-Train-to-Queens.mp3',
    contentType: 'audio/mpeg',
    category: 'single'
  },
  'feel-my-pain': {
    name: 'Feel My Pain',
    description: 'Feady Crocka — single. Lossless WAV master bounce.',
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/feel-my-pain.wav',
    filename: 'Feady-Crocka-Feel-My-Pain.wav',
    contentType: 'audio/wav',
    category: 'single'
  },
  '4-letter-word': {
    name: '4 Letter Word',
    description: "J'Dom — single. MP3 master.",
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/4-letter-word.mp3',
    filename: 'JDom-4-Letter-Word.mp3',
    contentType: 'audio/mpeg',
    category: 'single'
  },
  'one-night': {
    name: 'One Night',
    description: "J'Dom feat. E-40 — single. MP3 master.",
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/one-night.mp3',
    filename: 'JDom-One-Night-feat-E40.mp3',
    contentType: 'audio/mpeg',
    category: 'single'
  },
  'winnin': {
    name: 'Winnin',
    description: 'Spendoe — single. Lossless WAV master.',
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/winnin.wav',
    filename: 'Spendoe-Winnin.wav',
    contentType: 'audio/wav',
    category: 'single'
  },
  'coca-leaf': {
    name: 'Coca Leaf',
    description: 'San Quinn & Messy Marv — single. Lossless WAV master.',
    price: 1.99,
    s3Bucket: process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles',
    s3Key: 'digital-products/coca-leaf.wav',
    filename: 'San-Quinn-Messy-Marv-Coca-Leaf.wav',
    contentType: 'audio/wav',
    category: 'single'
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
