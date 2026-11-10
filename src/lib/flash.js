'use strict';

const config = require('../config');

const FLASH_COOKIE = 'dsw_flash';

function flash(req, res, next) {
  let messages = [];
  const raw = req.cookies ? req.cookies[FLASH_COOKIE] : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) messages = parsed;
    } catch {
      messages = [];
    }
    res.clearCookie(FLASH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/',
    });
  }

  res.locals.flash = messages;

  res.flash = (type, message) => {
    const nextMessages = [...messages, { type, message }];
    messages = nextMessages;
    res.locals.flash = nextMessages;
    res.cookie(FLASH_COOKIE, JSON.stringify(nextMessages), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 60 * 1000,
      path: '/',
    });
  };

  next();
}

module.exports = { flash, FLASH_COOKIE };
