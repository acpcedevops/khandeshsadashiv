'use strict';

const { getDb } = require('../db');

const INTERVAL_MS = 5 * 60 * 1000;

async function publishScheduled() {
  const db = getDb();
  const now = new Date().toISOString();
  const due = await db.all(
    `SELECT id, title FROM posts
      WHERE status = 'approved' AND publish_at IS NOT NULL AND publish_at <= ?`,
    [now]
  );

  for (const post of due) {
    await db.run(
      `UPDATE posts
          SET status = 'published', published_at = ?, updated_at = ?
        WHERE id = ?`,
      [now, now, post.id]
    );
    console.log(`[scheduler] Published scheduled post #${post.id}: ${post.title}`);
  }
  return due.length;
}

function startScheduler() {
  const tick = async () => {
    try {
      await publishScheduled();
    } catch (error) {
      console.error('[scheduler]', error.message);
    }
  };

  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { startScheduler, publishScheduled };
