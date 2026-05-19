const pool = require('../src/config/database');

/**
 * Seed database with sample product data
 * Usage: node migrations/seed.js
 */

const SAMPLE_PRODUCTS = [
  {
    name: 'Lo-Fi Hip Hop Beat',
    slug: 'lofi-hiphop-beat-001',
    description: 'Chill lo-fi hip hop beat perfect for study sessions and relaxation. Features smooth jazz samples and boom-bap drums.',
    category: 'hip-hop',
    price: 29.99,
    stock_quantity: 15,
    image_urls: ['https://via.placeholder.com/400?text=Lo-Fi+Beat'],
    specifications: {
      bpm: 85,
      key: 'F minor',
      duration: '3:45',
      format: 'WAV, MP3',
      license: 'commercial',
      production_year: 2024
    }
  },
  {
    name: 'Trap Banger 808',
    slug: 'trap-banger-808-001',
    description: 'Hard-hitting trap beat with heavy 808 bass and crisp hi-hats. Ready for hip-hop and rap releases.',
    category: 'hip-hop',
    price: 39.99,
    stock_quantity: 12,
    image_urls: ['https://via.placeholder.com/400?text=Trap+Banger'],
    specifications: {
      bpm: 140,
      key: 'D minor',
      duration: '4:20',
      format: 'WAV, MP3, FLAC',
      license: 'exclusive',
      production_year: 2024
    }
  },
  {
    name: 'Vintage Soul Sample Pack',
    slug: 'vintage-soul-sample-pack-001',
    description: 'Curated collection of vintage soul samples and loops. Perfect for jazz fusion, R&B, and neo-soul production.',
    category: 'samples',
    price: 49.99,
    stock_quantity: 8,
    image_urls: ['https://via.placeholder.com/400?text=Soul+Samples'],
    specifications: {
      sample_count: 127,
      bpm_range: '85-110',
      format: 'WAV, REX2, AIFF',
      license: 'multi-use',
      production_year: 2023
    }
  },
  {
    name: 'Digital Production Course - Fundamentals',
    slug: 'digital-production-course-fundamentals',
    description: 'Comprehensive online course covering beat production fundamentals, DAW workflows, and mixing techniques for beginners.',
    category: 'education',
    price: 79.99,
    stock_quantity: 100,
    image_urls: ['https://via.placeholder.com/400?text=Production+Course'],
    specifications: {
      duration: '12 hours',
      modules: 8,
      level: 'beginner',
      format: 'video-on-demand',
      access: 'lifetime',
      language: 'English'
    }
  },
  {
    name: 'Done Deal Digital Logo Sticker Pack',
    slug: 'done-deal-digital-sticker-pack',
    description: 'Premium vinyl sticker pack featuring Done Deal Digital branding. High-quality, weather-resistant stickers.',
    category: 'merch',
    price: 14.99,
    stock_quantity: 50,
    image_urls: ['https://via.placeholder.com/400?text=Sticker+Pack'],
    specifications: {
      quantity: 10,
      material: 'vinyl',
      waterproof: true,
      size: 'various',
      finish: 'glossy',
      production_year: 2024
    }
  },
  {
    name: 'Boom Bap Drums Sample Kit',
    slug: 'boom-bap-drums-sample-kit-001',
    description: 'Classic boom bap drum samples for hip-hop production. Clean, punchy breakbeats and individual drum sounds.',
    category: 'samples',
    price: 24.99,
    stock_quantity: 20,
    image_urls: ['https://via.placeholder.com/400?text=Boom+Bap'],
    specifications: {
      sample_count: 89,
      bpm: '95-110',
      format: 'WAV, MP3',
      license: 'commercial',
      production_year: 2024
    }
  },
  {
    name: 'Synth Wave Preset Bundle',
    slug: 'synth-wave-preset-bundle-001',
    description: 'Handcrafted synthesizer presets for retro-futuristic synthwave and vaporwave production. Works with Serum and Sylenth1.',
    category: 'plugins',
    price: 34.99,
    stock_quantity: 10,
    image_urls: ['https://via.placeholder.com/400?text=Synthwave+Presets'],
    specifications: {
      preset_count: 256,
      synths: ['Serum', 'Sylenth1'],
      style: 'synthwave',
      production_year: 2024
    }
  },
  {
    name: 'Feady Crocka - "Bay Street Lessons" EP',
    slug: 'feady-crocka-bay-street-lessons-ep',
    description: 'Debut EP from Bay Area artist Feady Crocka. 6 original tracks blending boom-bap production with introspective lyricism.',
    category: 'music',
    price: 9.99,
    stock_quantity: 100,
    image_urls: ['https://via.placeholder.com/400?text=Bay+Street+Lessons'],
    specifications: {
      tracks: 6,
      duration: '22 minutes',
      format: 'MP3, FLAC, WAV',
      release_date: '2024-05-01',
      artist: 'Feady Crocka',
      label: 'Done Deal Digital'
    }
  },
  {
    name: 'Production Consulting Session (1 Hour)',
    slug: 'production-consulting-session-1hr',
    description: 'One-on-one consultation with experienced producer. Discuss your production goals, get feedback on demos, and receive personalized guidance.',
    category: 'services',
    price: 149.99,
    stock_quantity: 20,
    image_urls: ['https://via.placeholder.com/400?text=Consulting'],
    specifications: {
      duration: '60 minutes',
      format: 'video-call',
      includes: ['feedback', 'guidance', 'production-tips'],
      booking_required: true,
      production_year: 2024
    }
  },
  {
    name: 'Analog Warmth VST Plugin',
    slug: 'analog-warmth-vst-plugin-001',
    description: 'High-quality analog emulation plugin for adding vintage warmth and saturation to digital recordings. Windows & Mac.',
    category: 'plugins',
    price: 59.99,
    stock_quantity: 25,
    image_urls: ['https://via.placeholder.com/400?text=Analog+Warmth'],
    specifications: {
      format: ['VST2', 'VST3', 'AU', 'AAX'],
      os: ['Windows', 'Mac'],
      license: 'perpetual',
      support: 'lifetime',
      production_year: 2023
    }
  },
  {
    name: 'Jazz Chord Progressions Video Tutorial',
    slug: 'jazz-chord-progressions-video-tutorial',
    description: 'In-depth video tutorial covering advanced jazz chord progressions, harmony theory, and application in beat production.',
    category: 'education',
    price: 39.99,
    stock_quantity: 50,
    image_urls: ['https://via.placeholder.com/400?text=Jazz+Chords'],
    specifications: {
      duration: '3 hours',
      lessons: 15,
      level: 'intermediate',
      format: 'video-on-demand',
      access: 'lifetime',
      production_year: 2024
    }
  },
  {
    name: 'Done Deal Digital Branded Hoodie',
    slug: 'done-deal-digital-branded-hoodie',
    description: 'Premium quality branded hoodie featuring Done Deal Digital embroidered logo. Available in black, navy, and heather grey.',
    category: 'merch',
    price: 54.99,
    stock_quantity: 30,
    image_urls: ['https://via.placeholder.com/400?text=Branded+Hoodie'],
    specifications: {
      material: '100% cotton',
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      colors: ['black', 'navy', 'heather-grey'],
      fit: 'unisex',
      production_year: 2024
    }
  }
];

async function seed() {
  try {
    console.log('🌱 Starting database seed...');

    // Check if products already exist
    const existingCheck = await pool.query('SELECT COUNT(*) as count FROM products');
    const existingCount = parseInt(existingCheck.rows[0].count);

    if (existingCount > 0) {
      console.log(`⚠️  Database already contains ${existingCount} products. Skipping seed.`);
      console.log('   To reseed, run: DELETE FROM products; then run this script again.');
      process.exit(0);
    }

    // Insert sample products
    let insertedCount = 0;
    for (const product of SAMPLE_PRODUCTS) {
      const result = await pool.query(
        `INSERT INTO products (name, slug, description, category, price, stock_quantity, image_urls, specifications)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name`,
        [
          product.name,
          product.slug,
          product.description,
          product.category,
          product.price,
          product.stock_quantity,
          JSON.stringify(product.image_urls),
          JSON.stringify(product.specifications)
        ]
      );

      if (result.rows.length > 0) {
        insertedCount++;
        console.log(`✓ Created: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
      }
    }

    console.log(`\n✅ Seed completed! Inserted ${insertedCount} products.`);

    // Display summary statistics
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(stock_quantity) as total_stock,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        COUNT(DISTINCT category) as categories
      FROM products
    `);

    const summary = stats.rows[0];
    console.log('\n📊 Database Summary:');
    console.log(`   Total Products: ${summary.total_products}`);
    console.log(`   Total Stock Units: ${summary.total_stock}`);
    console.log(`   Average Price: $${parseFloat(summary.avg_price).toFixed(2)}`);
    console.log(`   Price Range: $${parseFloat(summary.min_price).toFixed(2)} - $${parseFloat(summary.max_price).toFixed(2)}`);
    console.log(`   Categories: ${summary.categories}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    if (error.code === '23505') {
      console.error('   Duplicate key error - a product with this slug already exists.');
    }
    process.exit(1);
  }
}

// Run seed if called directly
if (require.main === module) {
  seed();
}

module.exports = seed;
