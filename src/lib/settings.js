'use strict';

const { getDb } = require('../db');

const DEFAULTS = {
  'site.name': 'डॉ. सदाशिव सुर्यवंशी',
  'site.name_en': 'Dr. Sadashiv Suryawanshi',
  'site.tagline': 'मराठी साहित्य · गझल · अहिराणी भाषा',
  'site.description':
    'प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी यांचे मराठी साहित्य, गझल, अहिराणी भाषा आणि साहित्यिक कार्य.',
  'site.owner_name': 'प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी',
  'site.owner_name_en': 'Prof. Dr. Sadashiv Shriram Suryawanshi',
  'site.contact_email': 'suryawanshisadashiv643@gmail.com',
  'site.contact_phone': '+91 94053 71313',
  'site.address': '२५-ए, समृद्धनगर, केलेनगरजवळ, नकाणे रोड, देवपूर, धुळे ४२४००२',
  'site.facebook': 'https://www.facebook.com/people/Dr-Sadashiv-Suryawanshi/100087394225559/',
  'site.youtube': 'https://www.youtube.com/channel/UCeQhpHp6XLMd0wsSLfHxDfg',
  'site.instagram': '',
  'site.x': '',
  'site.whatsapp': '',
  'home.quote': 'मायबोली जपली, तर पिढी जपली.',
  'home.sections': JSON.stringify([
    'hero', 'news', 'featured', 'latest', 'poem', 'timeline', 'books', 'events', 'newsletter',
  ]),
  'features.comments': '1',
  'features.newsletter': '1',
  'features.gallery': '1',
  'features.events': '1',
  'limits.title': '90',
  'limits.excerpt': '220',
  'limits.body': '12000',
};

let cache = null;
let cacheAt = 0;
const CACHE_MS = 15 * 1000;

function invalidateSettingsCache() {
  cache = null;
  cacheAt = 0;
}

async function loadSettings(req, res, next) {
  try {
    if (!cache || Date.now() - cacheAt > CACHE_MS) {
      const db = getDb();
      const rows = await db.all('SELECT key, value FROM settings');
      const merged = { ...DEFAULTS };
      for (const row of rows) merged[row.key] = row.value;
      cache = merged;
      cacheAt = Date.now();
    }
    res.locals.settings = cache;
    res.locals.siteName = cache['site.name'];
    res.locals.siteTagline = cache['site.tagline'];
    res.locals.siteDescription = cache['site.description'];
    res.locals.ownerName = cache['site.owner_name'];
    res.locals.currentYear = new Date().getFullYear();
    res.locals.currentPath = req.path;
    res.locals.query = req.query || {};
    res.locals.siteUrl = require('../config').siteUrl;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { DEFAULTS, loadSettings, invalidateSettingsCache };
