import { pool, query } from './backend/src/db.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file from backend directory
dotenvConfig({ path: resolve(__dirname, 'backend/.env') });

console.log('🔧 Environment loaded from backend/.env');
console.log(`📡 Database: ${process.env.DATABASE_URL ? 'Configured' : 'MISSING'}`);

async function runMigration() {
  console.log('🚀 Starting Phase 1 Critical Migration...');
  
  try {
    // Read migration SQL
    const migrationPath = resolve(__dirname, 'backend/migrations/022_fix_betting_period_critical.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded');
    
    // Execute migration
    await query(sql);
    
    console.log('✅ Migration executed successfully!');
    
    // Verify results
    const result = await query(`
      SELECT 
        COUNT(*) as total_markets,
        COUNT(*) FILTER (WHERE m.verification_status = 'VERIFIED') as verified_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'OPEN' AND m.verification_status = 'VERIFIED') as open_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'SUSPENDED' AND m.verification_status = 'VERIFIED') as suspended_markets,
        COUNT(*) FILTER (WHERE c.betting_status = 'OPEN' AND m.verification_status = 'VERIFIED' AND c.betting_period IS NOT NULL AND c.close_at > now()) as ready_for_betting
      FROM market_betting_configs c
      JOIN markets m ON m.id = c.market_id
      WHERE m.status = 'open'
    `);
    
    const stats = result.rows[0];
    console.log('\n📊 Migration Results:');
    console.log(`  Total markets: ${stats.total_markets}`);
    console.log(`  Verified: ${stats.verified_markets}`);
    console.log(`  Open: ${stats.open_markets}`);
    console.log(`  Suspended: ${stats.suspended_markets}`);
    console.log(`  Ready for betting: ${stats.ready_for_betting}`);
    
    if (parseInt(stats.ready_for_betting) > 0) {
      console.log('\n🎉 SUCCESS: Markets are now ready for betting!');
    } else {
      console.log('\n⚠️ WARNING: No markets ready for betting. Check verification_status.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();