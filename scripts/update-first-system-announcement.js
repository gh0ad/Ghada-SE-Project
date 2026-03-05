const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Find the oldest system announcement
    const r = await pool.query("SELECT * FROM announcements WHERE type = 'system' ORDER BY created_at ASC LIMIT 1");
    if (r.rows.length === 0) {
      console.log('No system announcement found — inserting a new one');
      const ins = await pool.query(
        `INSERT INTO announcements (title, message, type, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        ['Welcome to Amam — You\'re registered!', 'Congratulations — your account is now active. Start requesting rides and enjoy Amam!', 'system', 'system']
      );
      console.log('Inserted announcement:', ins.rows[0]);
      process.exit(0);
    }

    const ann = r.rows[0];
    console.log('Found system announcement id=', ann.id, 'title=', ann.title);

    const newTitle = 'Welcome to Amam — You\'re registered!';
    const newMessage = 'Congratulations — your account is now active. Start requesting rides and enjoy Amam!';

    const upd = await pool.query(
      `UPDATE announcements SET title = $1, message = $2 WHERE id = $3 RETURNING *`,
      [newTitle, newMessage, ann.id]
    );

    console.log('Updated announcement:', upd.rows[0]);
  } catch (e) {
    console.error('Error updating announcement', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
