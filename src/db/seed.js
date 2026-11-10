const bcrypt = require('bcryptjs');
const config = require('../config');
const { renderMarkdown, readingTime, makeExcerpt } = require('../lib/markdown');

async function setSetting(db, key, value) {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, typeof value === 'string' ? value : JSON.stringify(value)]
  );
}

async function createUser(db, user) {
  const hash = bcrypt.hashSync(user.password, 12);
  const result = await db.run(
    `INSERT INTO users
      (name, email, password_hash, role, status, auto_publish, pen_name, bio, city, phone, social_json, email_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.name,
      user.email,
      hash,
      user.role || 'contributor',
      user.status || 'pending',
      user.auto_publish ? 1 : 0,
      user.pen_name || null,
      user.bio || null,
      user.city || null,
      user.phone || null,
      user.social_json ? JSON.stringify(user.social_json) : null,
      user.email_verified ? 1 : 0,
    ]
  );
  return result.lastInsertRowid;
}

async function insertPost(db, post, authorId, categoryId) {
  const bodyHtml = renderMarkdown(post.body_md);
  const excerpt = post.excerpt || makeExcerpt(post.body_md);
  const publishedAt =
    post.status === 'published'
      ? new Date(post.published_at || Date.now()).toISOString()
      : null;

  const result = await db.run(
    `INSERT INTO posts
      (slug, title, excerpt, body_md, body_html, type, language, category_id, author_id,
       cover_url, cover_alt, tags, status, rejection_reason, is_featured, is_pinned, pin_order,
       publish_at, published_at, reading_time, view_count, seo_title, seo_description,
       source_url, source_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      post.slug,
      post.title,
      excerpt,
      post.body_md,
      bodyHtml,
      post.type || 'article',
      post.language || 'mr',
      categoryId || null,
      authorId,
      post.cover_url || null,
      post.cover_alt || null,
      post.tags || null,
      post.status || 'draft',
      post.rejection_reason || null,
      post.is_featured ? 1 : 0,
      post.is_pinned ? 1 : 0,
      post.pin_order || 0,
      post.publish_at || null,
      publishedAt,
      readingTime(post.body_md),
      0,
      post.seo_title || null,
      post.seo_description || null,
      post.source_url || null,
      post.source_name || null,
    ]
  );
  return result.lastInsertRowid;
}

async function seed(db) {
  const existing = await db.get('SELECT COUNT(*) AS count FROM users');
  if (Number(existing.count) > 0) return;

  // ── Settings ──────────────────────────────────────────────
  const settings = {
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
    'limits.title': String(config.contentLimits.title),
    'limits.excerpt': String(config.contentLimits.excerpt),
    'limits.body': String(config.contentLimits.body),
  };
  for (const [key, value] of Object.entries(settings)) {
    await setSetting(db, key, value);
  }

  // ── Users ─────────────────────────────────────────────────
  const ownerId = await createUser(db, {
    name: 'प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी',
    email: config.seedOwnerEmail,
    password: config.seedOwnerPassword,
    role: 'owner',
    status: 'active',
    email_verified: true,
    city: 'धुळे',
    phone: '+91 94053 71313',
    bio:
      'धुळे येथील मराठी लेखक, गझलकार आणि अहिराणी भाषा-चळवळीतील कार्यकर्ते. खान्देश साहित्य संघाचे राष्ट्रीय अध्यक्ष. खान्देशातील मराठी, अहिराणी आणि इतर बोलीभाषांतील साहित्यिकांना व्यासपीठ उपलब्ध करून देण्यासाठी कार्यरत.',
    social_json: {
      facebook: 'https://www.facebook.com/people/Dr-Sadashiv-Suryawanshi/100087394225559/',
      youtube: 'https://www.youtube.com/channel/UCeQhpHp6XLMd0wsSLfHxDfg',
    },
  });

  const contributorId = await createUser(db, {
    name: 'नमुना लेखक',
    email: 'writer@example.com',
    password: 'Writer@12345',
    role: 'contributor',
    status: 'pending',
    email_verified: true,
    city: 'धुळे',
    bio: 'नमुना लेखक खाते — खाते मंजुरी आणि लेख मंजुरी प्रक्रिया दाखवण्यासाठी.',
  });

  // ── Categories ────────────────────────────────────────────
  const categories = [
    { slug: 'kavita', name_mr: 'कविता', name_en: 'Poetry', kind: 'article', sort_order: 1 },
    { slug: 'katha', name_mr: 'कथा', name_en: 'Story', kind: 'article', sort_order: 2 },
    { slug: 'lalit', name_mr: 'ललित', name_en: 'Lalit', kind: 'article', sort_order: 3 },
    { slug: 'samiksha', name_mr: 'समीक्षा', name_en: 'Review', kind: 'article', sort_order: 4 },
    { slug: 'gazal', name_mr: 'गझल', name_en: 'Ghazal', kind: 'article', sort_order: 5 },
    { slug: 'ahirani', name_mr: 'अहिराणी', name_en: 'Ahirani', kind: 'article', sort_order: 6 },
    { slug: 'hasya', name_mr: 'हास्य', name_en: 'Humour', kind: 'article', sort_order: 7 },
    { slug: 'pravas', name_mr: 'प्रवास', name_en: 'Travel', kind: 'article', sort_order: 8 },
    { slug: 'book-review', name_mr: 'पुस्तक परीक्षण', name_en: 'Book Review', kind: 'article', sort_order: 9 },
    { slug: 'news', name_mr: 'बातम्या', name_en: 'News', kind: 'news', sort_order: 10 },
    { slug: 'achievement', name_mr: 'कामगिरी', name_en: 'Achievement', kind: 'news', sort_order: 11 },
  ];
  const cat = {};
  for (const c of categories) {
    const r = await db.run(
      'INSERT INTO categories (slug, name_mr, name_en, kind, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [c.slug, c.name_mr, c.name_en, c.kind, c.sort_order]
    );
    cat[c.slug] = r.lastInsertRowid;
  }

  // ── Posts ─────────────────────────────────────────────────
  const publishedNews = [
    {
      slug: 'khandesh-sahitya-sangh-bahubhashik-sammelan-jalgaon',
      title: 'खान्देश साहित्य संघाचे पहिले बहुभाषिक साहित्य संमेलन जळगावात घोषित',
      excerpt:
        'खान्देश साहित्य संघाच्या प्रथम वर्धापन दिनानिमित्त जळगावात बहुभाषिक साहित्य संमेलनाची घोषणा.',
      type: 'news',
      language: 'mr',
      category: 'news',
      tags: 'खान्देश साहित्य संघ, बहुभाषिक संमेलन, जळगाव',
      status: 'published',
      published_at: '2021-08-30T09:00:00Z',
      is_featured: true,
      is_pinned: true,
      pin_order: 1,
      source_name: 'पब्लिक मिरर न्यूज',
      source_url: 'https://publicmirrornews.com/2464/',
      body_md: `खान्देश साहित्य संघाचे पहिले बहुभाषिक साहित्य संमेलन जळगाव येथे होणार असल्याची घोषणा संघाचे केंद्रीय अध्यक्ष प्रा. डॉ. सदाशिव सुर्यवंशी यांनी केली.

संघाच्या प्रथम वर्धापन दिनानिमित्त झालेल्या साहित्यिक सहविचार सभेत हा ठराव सर्वानुमते पारित करण्यात आला. अहिराणीसह बागलाणी, नेमाडी, लाडशिक्की, पावरी, भिलाऊ, भावसारी, लेवा पाटीदारी, गुजराऊ, तडवी, डांगी, पावरा, कोकणी, नंदुरबारी, उर्दू, हिंदी आणि मराठी या भाषा-बोलीभाषांचा समावेश संमेलनात करण्याचे नियोजन आहे.

संमेलनात ग्रंथदिंडी, उद्घाटन, स्मरणिका प्रकाशन, मुलाखत, परिसंवाद, कथाकथन, गझल मुशायरा, कवीसंमेलन आणि लोककला दर्शन असे उपक्रम होणार आहेत.

> स्रोत: पब्लिक मिरर न्यूज, ३० ऑगस्ट २०२१.`,
    },
    {
      slug: 'maratha-seva-sangh-36-vardhapan-vyakhyan',
      title: 'मराठा सेवा संघाच्या ३६ व्या वर्धापन दिन व्याख्यानात प्रतिपादन',
      excerpt:
        "धुळे येथे 'मराठा सेवा संघ: काल, आज, उद्या' या विषयावर व्याख्यान.",
      type: 'news',
      language: 'mr',
      category: 'news',
      tags: 'मराठा सेवा संघ, धुळे, व्याख्यान',
      status: 'published',
      published_at: '2026-09-11T09:00:00Z',
      is_pinned: true,
      pin_order: 2,
      source_name: 'दिव्य मराठी',
      source_url:
        'https://divyamarathi.bhaskar.com/local/maharashtra/jalgaon/dhule/news/maratha-seva-sanghs-global-enlightenment-movement-dr-sadashiv-suryavanshis-statement-in-the-maratha-seva-sangh-36th-anniversary-lecture-dbp-138995840.html',
      body_md: `मराठा सेवा संघाच्या ३६ व्या वर्धापन दिनानिमित्त धुळे जिल्हा कार्यालयात 'मराठा सेवा संघ: काल, आज, उद्या' या विषयावर व्याख्यान आयोजित करण्यात आले होते.

यावेळी बोलताना प्रा. डॉ. सदाशिव सुर्यवंशी म्हणाले की, मराठा ही केवळ जात नसून तो एक विचार आहे. स्वातंत्र्य, न्याय, समता, बंधुता आणि सामाजिक लोकशाही या मूल्यांचा पुरस्कार करणारी ही संघटना १ सप्टेंबर १९९० रोजी स्थापन झाली. आज ती प्रबोधनात्मक कक्षांच्या माध्यमातून देश-विदेशात वैचारिक प्रबोधन करत आहे.

बदलत्या जगाचा वेध घेण्यासाठी तरुणाईने छत्रपती शिवाजी महाराज आणि राष्ट्रमाता जिजाऊ यांचा विचार आत्मसात करावा, असे आवाहनही त्यांनी केले.

> स्रोत: दिव्य मराठी, धुळे.`,
    },
    {
      slug: 'khandesh-sahitya-sangh-amalner-baitha',
      title: 'अमळनेर येथे खान्देश साहित्य संघाची बैठक; नव्या पिढीला व्यासपीठ देण्याचा संदेश',
      excerpt: 'प्रताप महाविद्यालयात झालेल्या बैठकीत साहित्य चळवळ टिकवण्यावर भर.',
      type: 'news',
      language: 'mr',
      category: 'news',
      tags: 'खान्देश साहित्य संघ, अमळनेर, साहित्य चळवळ',
      status: 'published',
      published_at: '2026-01-12T09:00:00Z',
      source_name: 'देश की समस्या',
      source_url: 'https://deshkisamassya.blogspot.com/2026/01/blog-post_747.html',
      body_md: `खान्देश साहित्य संघाची बैठक अमळनेर येथील प्रताप महाविद्यालयाच्या गांधी अध्ययन केंद्रात प्रा. डॉ. सदाशिव सुर्यवंशी यांच्या अध्यक्षतेखाली पार पडली.

यावेळी बोलताना ते म्हणाले की, अमळनेर ही साहित्य संस्कृतीची भूमी आहे. साहित्य चळवळ टिकवणे गरजेचे आहे. नव्या पिढीला व्यासपीठ उपलब्ध करताना त्यांच्यात साहित्याची आवड निर्माण करणेही आवश्यक आहे.

बैठकीत खान्देश साहित्य संघाच्या विविध पदांवर नियुक्त्या करण्यात आल्या. पुढील साहित्य संमेलन आणि मराठी-अहिराणी भाषांचे महत्त्व वाढवण्यासाठी विविध उपक्रम राबवण्यावर चर्चा झाली.

> स्रोत: देश की समस्या, जानेवारी २०२६.`,
    },
  ];

  for (const p of publishedNews) {
    await insertPost(db, p, ownerId, cat[p.category]);
  }

  // Sample articles (clearly marked)
  const articles = [
    {
      slug: 'marathi-ani-ahirani-bhashecha-varasa',
      title: 'मराठी आणि अहिराणी: भाषेचा वारसा जपण्याची गरज',
      excerpt: 'भाषा केवळ संवादाचे माध्यम नाही; ती संस्कृतीची स्मृती आहे.',
      type: 'article',
      language: 'mr',
      category: 'lalit',
      tags: 'मराठी, अहिराणी, भाषा, खान्देश',
      status: 'published',
      published_at: '2026-10-20T09:00:00Z',
      is_featured: true,
      body_md: `> हा नमुना लेख आहे. अंतिम प्रकाशनापूर्वी डॉ. सुर्यवंशी यांची मंजुरी आवश्यक आहे.

भाषा केवळ संवादाचे माध्यम नाही. ती आपल्या संस्कृतीची स्मृती आहे, आपल्या पूर्वजांचा अनुभव आहे आणि पुढच्या पिढीला द्यायचा वारसा आहे. मराठी भाषेच्या कुटुंबात अहिराणी, बागलाणी, नेमाडी, पावरी अशा अनेक बोलीभाषा आहेत. प्रत्येक बोलीभाषेत त्या प्रदेशाची माती, त्याचे लोकजीवन आणि त्याची लय साठवलेली आहे.

खान्देशच्या साहित्यिक चळवळीने या बोलीभाषांना व्यासपीठ देण्याचा प्रयत्न केला आहे. खान्देश साहित्य संघाच्या माध्यमातून अहिराणीसह इतर बोलीभाषांतील लेखकांना एकत्र आणले जाते. हे केवळ भाषा-प्रेम नाही; ती सांस्कृतिक आत्मसन्मानाची चळवळ आहे.

भाषा टिकते ती घरात, बाजारात, शाळेत आणि साहित्यात. त्यामुळे बोलीभाषांना केवळ बोलण्यापुरते मर्यादित न ठेवता त्यांना लेखनाचे, प्रकाशनाचे आणि सन्मानाचे व्यासपीठ मिळाले पाहिजे. नव्या पिढीने मायबोली जपली, तरच भाषेचा वारसा टिकेल.`,
    },
    {
      slug: 'sahitya-chalval-ani-navi-pidhi',
      title: 'साहित्य चळवळ आणि नवी पिढी',
      excerpt: 'नव्या पिढीला व्यासपीठ मिळाले तर साहित्य चळवळ जिवंत राहते.',
      type: 'article',
      language: 'mr',
      category: 'lalit',
      tags: 'साहित्य चळवळ, नवी पिढी, खान्देश',
      status: 'published',
      published_at: '2026-10-28T09:00:00Z',
      body_md: `> हा नमुना लेख आहे. अंतिम प्रकाशनापूर्वी डॉ. सुर्यवंशी यांची मंजुरी आवश्यक आहे.

कोणतीही साहित्य चळवळ तेव्हाच जिवंत राहते, जेव्हा ती नव्या पिढीला आपलीशी वाटते. जुन्या पिढीचा अनुभव आणि नव्या पिढीची ऊर्जा एकत्र आली, तरच साहित्यात नवे प्रयोग घडतात.

खान्देशात साहित्याची परंपरा समृद्ध आहे. पण परंपरा म्हणजे केवळ स्मरण नाही; ती पुढे नेण्याची जबाबदारी आहे. नव्या लेखकांना वाचनाची सवय, लेखनाची धैर्यता आणि प्रकाशनाची संधी मिळाली पाहिजे. त्यासाठी संमेलने, कार्यशाळा, कवीसंमेलने आणि ऑनलाइन व्यासपीठे उपयुक्त ठरतात.

साहित्य चळवळीचे खरे यश म्हणजे एखादा नवा लेखक स्वतःच्या आवाजात बोलू लागणे. तो आवाज जपणे हीच आपली जबाबदारी आहे.`,
    },
  ];
  for (const p of articles) {
    await insertPost(db, p, ownerId, cat[p.category]);
  }

  // Sample poem (Ahirani)
  await insertPost(
    db,
    {
      slug: 'mayboli-ahirani-kavita',
      title: 'मायबोली अहिराणी',
      excerpt: 'अहिराणी मायबोलीवर एक नमुना कविता.',
      type: 'poem',
      language: 'ahr',
      category: 'ahirani',
      tags: 'अहिराणी, कविता, मायबोली',
      status: 'published',
      published_at: '2026-11-01T09:00:00Z',
      is_featured: true,
      body_md: `> नमुना कविता — अंतिम प्रकाशनापूर्वी मंजुरी आवश्यक.

मायबोली अहिराणी,
खान्देशच्या मातीतली राणी.
बोलतो जेव्हा आई,
हळवी होते माझी वाणी.

डोंगर, नदी, शेत आन् माती,
येथल्या माणसांची साथी.
शब्दांमधे गोडवा तिचा,
पिढ्यांपिढ्यांची परंपरा जुनी.

मायबोली अहिराणी,
खान्देशच्या मातीतली राणी.`,
    },
    ownerId,
    cat.ahirani
  );

  // Pending submission (demonstrates the approval queue)
  await insertPost(
    db,
    {
      slug: 'ahirani-lokgeetanchi-vatchal',
      title: 'अहिराणी लोकगीतांची वाटचाल',
      excerpt: 'अहिराणी लोकगीतांवर नवा लेख — मंजुरीसाठी सादर.',
      type: 'article',
      language: 'ahr',
      category: 'ahirani',
      tags: 'अहिराणी, लोकगीते, संस्कृती',
      status: 'pending_review',
      body_md: `अहिराणी लोकगीते खान्देशच्या लोकजीवनाचा आरसा आहेत. शेती, विवाह, सण आणि दैनंदिन जीवनातील भावना या गीतांमध्ये उतरतात.

हा लेख मंजुरीसाठी सादर केलेला नमुना आहे. मंजुरीनंतर तो प्रकाशित होईल.`,
    },
    contributorId,
    cat.ahirani
  );

  // ── Media mentions ────────────────────────────────────────
  const media = [
    {
      title_mr: 'मराठा सेवा संघ ३६ व्या वर्धापन दिन व्याख्यानात डॉ. सदाशिव सुर्यवंशी यांचे प्रतिपादन',
      publication: 'दिव्य मराठी',
      url:
        'https://divyamarathi.bhaskar.com/local/maharashtra/jalgaon/dhule/news/maratha-seva-sanghs-global-enlightenment-movement-dr-sadashiv-suryavanshis-statement-in-the-maratha-seva-sangh-36th-anniversary-lecture-dbp-138995840.html',
      published_on: '2026-09-11',
    },
    {
      title_mr: 'खान्देश साहित्य संघाचे पहिले बहुभाषिक संमेलन जळगावात',
      publication: 'पब्लिक मिरर न्यूज',
      url: 'https://publicmirrornews.com/2464/',
      published_on: '2021-08-30',
    },
  ];
  for (const [index, m] of media.entries()) {
    await db.run(
      'INSERT INTO media (title_mr, publication, url, published_on, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [m.title_mr, m.publication, m.url, m.published_on, null, index + 1]
    );
  }

  // ── Sample books (clearly marked, replace from admin) ─────
  const books = [
    {
      slug: 'namuna-kavita-sangrah',
      title: 'नमुना कविता संग्रह',
      description_mr: 'ही नमुना नोंद आहे. प्रत्यक्ष पुस्तकाची माहिती, मुखपृष्ठ आणि खरेदी दुवे प्रशासनातून जोडा.',
      publisher: 'नमुना प्रकाशन',
      year: '२०२५',
      sort_order: 1,
    },
    {
      slug: 'namuna-gazal-sangrah',
      title: 'नमुना गझल संग्रह',
      description_mr: 'ही नमुना नोंद आहे. गझल संग्रहाची प्रत्यक्ष माहिती प्रशासनातून अद्ययावत करा.',
      publisher: 'नमुना प्रकाशन',
      year: '२०२४',
      sort_order: 2,
    },
    {
      slug: 'namuna-ahirani-lekhsangrah',
      title: 'नमुना अहिराणी लेखसंग्रह',
      description_mr: 'ही नमुना नोंद आहे. अहिराणी लेखसंग्रहाची माहिती प्रशासनातून जोडा.',
      publisher: 'नमुना प्रकाशन',
      year: '२०२३',
      sort_order: 3,
    },
  ];
  for (const book of books) {
    await db.run(
      `INSERT INTO books (slug, title, cover_url, description_mr, publisher, year, isbn, language, buy_links_json, sort_order)
       VALUES (?, ?, NULL, ?, ?, ?, NULL, 'mr', NULL, ?)`,
      [book.slug, book.title, book.description_mr, book.publisher, book.year, book.sort_order]
    );
  }

  // ── Sample events ─────────────────────────────────────────
  const events = [
    {
      slug: 'namuna-kavisammelan-dhule',
      title: 'नमुना कवीसंमेलन — धुळे',
      description_mr: 'हा नमुना कार्यक्रम आहे. प्रत्यक्ष कार्यक्रमाची माहिती प्रशासनातून अद्ययावत करा.',
      venue: 'धुळे',
      starts_at: '2026-12-20T17:30:00+05:30',
      status: 'upcoming',
    },
    {
      slug: 'namuna-gazal-mushaira-jalgaon',
      title: 'नमुना गझल मुशायरा — जळगाव',
      description_mr: 'हा नमुना कार्यक्रम आहे. मुशायऱ्याची प्रत्यक्ष माहिती प्रशासनातून जोडा.',
      venue: 'जळगाव',
      starts_at: '2027-01-17T18:00:00+05:30',
      status: 'upcoming',
    },
    {
      slug: 'namuna-sahitya-baithak-amalner',
      title: 'नमुना साहित्य बैठक — अमळनेर',
      description_mr: 'हा नमुना झालेला कार्यक्रम आहे. प्रत्यक्ष अहवाल प्रशासनातून जोडा.',
      venue: 'अमळनेर',
      starts_at: '2026-09-12T11:00:00+05:30',
      status: 'completed',
    },
  ];
  for (const event of events) {
    await db.run(
      `INSERT INTO events (slug, title, description_mr, venue, starts_at, ends_at, cover_url, map_url, status)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      [event.slug, event.title, event.description_mr, event.venue, event.starts_at, event.status]
    );
  }

  // ── Sample gallery album ──────────────────────────────────
  const albumResult = await db.run(
    `INSERT INTO albums (slug, title_mr, description_mr, cover_url)
     VALUES (?, ?, ?, ?)`,
    [
      'namuna-chhayachitra-dalan',
      'नमुना छायाचित्र दालन',
      'ही नमुना दालन नोंद आहे. प्रत्यक्ष कार्यक्रमांची छायाचित्रे प्रशासनातून अपलोड करा.',
      '/images/gallery-sammelan.svg',
    ]
  );
  const albumPhotos = [
    { url: '/images/gallery-sammelan.svg', caption: 'साहित्य संमेलन — नमुना छायाचित्र' },
    { url: '/images/gallery-kavisammelan.svg', caption: 'कवीसंमेलन — नमुना छायाचित्र' },
    { url: '/images/gallery-mushaira.svg', caption: 'गझल मुशायरा — नमुना छायाचित्र' },
  ];
  for (const [index, photo] of albumPhotos.entries()) {
    await db.run(
      'INSERT INTO photos (album_id, url, alt_mr, caption_mr, sort_order) VALUES (?, ?, ?, ?, ?)',
      [albumResult.lastInsertRowid, photo.url, photo.caption, photo.caption, index]
    );
  }

  console.log('[seed] Database seeded.');
  console.log(`[seed] Owner login: ${config.seedOwnerEmail} / ${config.seedOwnerPassword}`);
  console.log('[seed] Pending contributor: writer@example.com / Writer@12345');
}

module.exports = { seed, setSetting };
