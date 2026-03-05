const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Ensure table exists
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT,
      message TEXT,
      type VARCHAR(50) DEFAULT 'system',
      event_date TIMESTAMP NULL,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    const announcements = [
      { title: 'Platform Maintenance', message: 'Platform will be under maintenance from 2-4 AM. Services may be temporarily unavailable.', type: 'system', created_by: 'system' },
      { title: 'New Feature: Saved Routes', message: 'You can now save favorite routes for quicker requests in the future.', type: 'system', created_by: 'system' },
      { title: 'Annual Sports Day', message: 'Join us for the Annual Sports Day on November 15th! Rides available to the sports complex starting 8 AM.', type: 'event', event_date: null, created_by: 'university' },
      { title: 'Library Extended Hours', message: 'The university library will extend hours this week till midnight for exam preparations.', type: 'event', event_date: null, created_by: 'university' }
    ];

    for (const a of announcements) {
      const res = await pool.query(
        `INSERT INTO announcements (title, message, type, event_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [a.title, a.message, a.type || 'system', a.event_date || null, a.created_by || null]
      );
      console.log('Inserted announcement id=', res.rows[0].id, res.rows[0].title);
    }

    console.log('Seeding complete');
  } catch (e) {
    console.error('Seeding failed', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
