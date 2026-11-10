'use strict';

async function notifyUser(db, userId, { type, title, body, link }) {
  if (!userId) return null;
  const result = await db.run(
    `INSERT INTO notifications (user_id, type, title_mr, body_mr, link)
     VALUES (?, ?, ?, ?, ?)`,
    [Number(userId), type, title, body || null, link || null]
  );
  return result.lastInsertRowid;
}

async function notifyStaff(db, payload) {
  const staff = await db.all(
    "SELECT id FROM users WHERE role IN ('owner', 'admin', 'editor') AND status = 'active'"
  );
  const ids = [];
  for (const person of staff) {
    ids.push(await notifyUser(db, person.id, payload));
  }
  return ids;
}

async function logAudit(db, req, action, entity, entityId, meta) {
  try {
    const actorId = req && req.user ? req.user.id : null;
    await db.run(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta_json)
       VALUES (?, ?, ?, ?, ?)`,
      [actorId, action, entity || null, entityId || null, meta ? JSON.stringify(meta) : null]
    );
  } catch (error) {
    console.error('[audit]', error.message);
  }
}

module.exports = { notifyUser, notifyStaff, logAudit };
