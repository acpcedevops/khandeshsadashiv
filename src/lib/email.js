'use strict';

const config = require('../config');
const { escapeHtml } = require('./helpers');

async function sendMail({ to, subject, html, text }) {
  if (!to) return { ok: false, skipped: true, reason: 'no-recipient' };

  if (!config.resendApiKey) {
    console.log('\n──────── [email:dev] ────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || String(html || '').replace(/<[^>]+>/g, ' '));
    console.log('─────────────────────────────\n');
    return { ok: true, skipped: true, dev: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[email] Resend error:', response.status, detail);
      return { ok: false, error: detail };
    }
    return { ok: true };
  } catch (error) {
    console.error('[email] send failed:', error.message);
    return { ok: false, error: error.message };
  }
}

function layout(title, body) {
  return `<!doctype html>
<html lang="mr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#fbf7ef;font-family:Arial,'Noto Sans Devanagari',sans-serif;color:#1f1b16;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#7a1f1f;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;">
      <div style="font-size:18px;font-weight:700;">${escapeHtml(config.ownerEmail === '' ? 'साहित्य व्यासपीठ' : 'डॉ. सदाशिव सुर्यवंशी')}</div>
      <div style="font-size:12px;color:#f2dfb8;letter-spacing:1px;">मराठी साहित्य · गझल · अहिराणी</div>
    </div>
    <div style="background:#fff;padding:22px;border:1px solid #e5dccb;border-top:0;border-radius:0 0 14px 14px;">
      ${body}
    </div>
    <p style="font-size:12px;color:#6b6257;text-align:center;margin-top:14px;">
      हा ईमेल ${escapeHtml(config.siteUrl)} वरून पाठवला आहे.
    </p>
  </div>
</body></html>`;
}

function button(href, label) {
  return `<p style="margin:22px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#7a1f1f;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a></p>`;
}

async function sendVerificationEmail(user, token) {
  const link = `${config.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: user.email,
    subject: 'तुमचा ईमेल पुष्टी करा — डॉ. सदाशिव सुर्यवंशी',
    text: `नमस्कार ${user.name},\n\nतुमचे खाते पुष्टी करण्यासाठी खालील दुवा उघडा:\n${link}\n\nधन्यवाद.`,
    html: layout('ईमेल पुष्टी', `
      <h2 style="margin:0 0 12px;color:#5c1414;">नमस्कार ${escapeHtml(user.name)},</h2>
      <p>साहित्य व्यासपीठावर नोंदणी केल्याबद्दल धन्यवाद. तुमचा ईमेल पुष्टी करण्यासाठी खालील बटणावर क्लिक करा.</p>
      ${button(link, 'ईमेल पुष्टी करा')}
      <p style="font-size:13px;color:#6b6257;">दुवा चालत नसल्यास: <br>${escapeHtml(link)}</p>
    `),
  });
}

async function sendPasswordResetEmail(user, token) {
  const link = `${config.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: user.email,
    subject: 'पासवर्ड रीसेट — डॉ. सदाशिव सुर्यवंशी',
    text: `नमस्कार ${user.name},\n\nपासवर्ड रीसेट करण्यासाठी खालील दुवा उघडा (१ तासासाठी वैध):\n${link}\n\nजर तुम्ही ही विनंती केली नसेल, तर हा ईमेल दुर्लक्षित करा.`,
    html: layout('पासवर्ड रीसेट', `
      <h2 style="margin:0 0 12px;color:#5c1414;">पासवर्ड रीसेट</h2>
      <p>नमस्कार ${escapeHtml(user.name)}, पासवर्ड रीसेट करण्यासाठी खालील बटणावर क्लिक करा. हा दुवा १ तासासाठी वैध आहे.</p>
      ${button(link, 'नवीन पासवर्ड ठरवा')}
      <p style="font-size:13px;color:#6b6257;">जर तुम्ही ही विनंती केली नसेल, तर हा ईमेल दुर्लक्षित करा.</p>
    `),
  });
}

async function notifyOwnerNewSubmission(post, author) {
  const link = `${config.siteUrl}/admin/posts/${post.id}`;
  return sendMail({
    to: config.ownerEmail,
    subject: `नवीन लेख मंजुरीसाठी सादर — ${post.title}`,
    text: `${author.name} (${author.email}) यांनी "${post.title}" हा लेख मंजुरीसाठी सादर केला आहे.\n\nपुनरावलोकन: ${link}`,
    html: layout('नवीन लेख मंजुरीसाठी', `
      <h2 style="margin:0 0 12px;color:#5c1414;">नवीन लेख सादर</h2>
      <p><strong>${escapeHtml(author.name)}</strong> (${escapeHtml(author.email)}) यांनी नवीन लेख मंजुरीसाठी सादर केला आहे.</p>
      <p style="font-size:18px;font-family:Georgia,serif;color:#1f1b16;">${escapeHtml(post.title)}</p>
      ${button(link, 'लेख पुनरावलोकन करा')}
    `),
  });
}

async function notifyContributorStatus(post, status, reason) {
  const statusText = {
    published: 'प्रकाशित',
    changes_requested: 'बदल आवश्यक',
    rejected: 'नामंजूर',
    approved: 'मंजूर',
  }[status] || status;

  const link = `${config.siteUrl}/dashboard/posts/${post.id}/edit`;
  const body = `
    <h2 style="margin:0 0 12px;color:#5c1414;">तुमच्या लेखाची स्थिती: ${escapeHtml(statusText)}</h2>
    <p>लेख: <strong>${escapeHtml(post.title)}</strong></p>
    ${reason ? `<p style="background:#fbf0d5;padding:12px;border-radius:8px;"><strong>टिप्पणी:</strong> ${escapeHtml(reason)}</p>` : ''}
    ${button(link, 'लेख पहा / संपादित करा')}
  `;
  return sendMail({
    to: post.author_email,
    subject: `तुमच्या लेखाची स्थिती: ${statusText}`,
    text: `लेख: ${post.title}\nस्थिती: ${statusText}\n${reason ? `टिप्पणी: ${reason}\n` : ''}${link}`,
    html: layout('लेख स्थिती', body),
  });
}

async function notifyAccountApproved(user) {
  const link = `${config.siteUrl}/dashboard`;
  return sendMail({
    to: user.email,
    subject: 'तुमचे खाते मंजूर झाले — डॉ. सदाशिव सुर्यवंशी',
    text: `नमस्कार ${user.name},\n\nतुमचे लेखक खाते मंजूर झाले आहे. आता तुम्ही लेख, कविता सादर करू शकता.\n\n${link}`,
    html: layout('खाते मंजूर', `
      <h2 style="margin:0 0 12px;color:#5c1414;">अभिनंदन, ${escapeHtml(user.name)}!</h2>
      <p>तुमचे लेखक खाते मंजूर झाले आहे. आता तुम्ही लेख आणि कविता मंजुरीसाठी सादर करू शकता.</p>
      ${button(link, 'डॅशबोर्ड उघडा')}
    `),
  });
}

async function notifyNewComment(post, comment) {
  const link = `${config.siteUrl}/admin/comments`;
  return sendMail({
    to: config.ownerEmail,
    subject: 'नवीन टिप्पणी मंजुरीसाठी',
    text: `"${post.title}" या लेखावर ${comment.author_name} यांनी टिप्पणी केली आहे.\n\n${link}`,
    html: layout('नवीन टिप्पणी', `
      <h2 style="margin:0 0 12px;color:#5c1414;">नवीन टिप्पणी</h2>
      <p><strong>${escapeHtml(comment.author_name)}</strong> यांनी "${escapeHtml(post.title)}" वर टिप्पणी केली:</p>
      <blockquote style="border-left:3px solid #c8a24a;margin:12px 0;padding:8px 14px;background:#fffdf8;">${escapeHtml(comment.body)}</blockquote>
      ${button(link, 'टिप्पणी पुनरावलोकन करा')}
    `),
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  notifyOwnerNewSubmission,
  notifyContributorStatus,
  notifyAccountApproved,
  notifyNewComment,
};
