'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('../config');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

let supabaseClient = null;

function supabaseConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseServiceKey);
}

function getSupabase() {
  if (!supabaseClient) {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('फक्त JPG, PNG, WEBP, GIF किंवा AVIF चित्रे अपलोड करता येतात.'));
    }
    return cb(null, true);
  },
});

function extensionFor(file) {
  const fromMime = EXT_BY_MIME[file.mimetype];
  if (fromMime) return fromMime;
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ALLOWED_MIME.size && ext ? ext : '.jpg';
}

async function saveImage(file, prefix = 'media') {
  if (!file || !file.buffer) return null;

  const ext = extensionFor(file);
  const baseName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const objectPath = `${prefix}/${baseName}`;

  if (supabaseConfigured()) {
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from(config.supabaseBucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: '31536000',
      });
    if (error) {
      throw new Error(`चित्र अपलोड अयशस्वी: ${error.message}`);
    }
    const { data } = supabase.storage.from(config.supabaseBucket).getPublicUrl(objectPath);
    return data.publicUrl;
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, baseName), file.buffer);
  return `/uploads/${baseName}`;
}

async function saveImages(files, prefix = 'media') {
  if (!files || !files.length) return [];
  const urls = [];
  for (const file of files) {
    urls.push(await saveImage(file, prefix));
  }
  return urls;
}

module.exports = {
  ALLOWED_MIME,
  upload,
  saveImage,
  saveImages,
  supabaseConfigured,
};
