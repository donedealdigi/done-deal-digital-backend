#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const migrationsDir = __dirname;

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  try {
    // Read all SQL files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('✅ No migrations to run.');
      process.exit(0);
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        console.log(`Running migration: ${file}...`);
        await pool.query(sql);
        console.log(`✅ ${file} completed.\n`);
      } catch (error) {
        console.error(`❌ Error in ${file}:`, error.message);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
