require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function reset() {
    try {
        console.log('🔄 Resetting database...');
        await pool.query(`
            DROP TABLE IF EXISTS messages CASCADE;
            DROP TABLE IF EXISTS rides CASCADE;
            DROP TABLE IF EXISTS driver_applications CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
        `);
        console.log('✅ Dropped tables. Now run: npm run init-db');
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

reset();
