#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULTS = {
  newsUrl: 'https://cenacolovinciano.org/notizie/',
  baseUrl: 'https://cenacolovinciano.org',
  limit: 40,
  timeoutMs: 20_000,
};

const TITLE_PATTERNS = [
  /^in vendita i biglietti per/i,
  /^apertura vendite/i,
];

const BODY_KEYWORDS = [
  'saranno messi in vendita i biglietti',
  'messi in vendita i biglietti',
  'apertura vendite',
  'in vendita i biglietti',
];

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toAbsolute(url, baseUrl) {
  if (!url) return '';
  try {
    return new URL(url, baseUrl).toString();
  } catch (_) {
    return url;
  }
}

function extractDate($card, $) {
  const timeNode = $card.find('time').first();
  const datetime = normalizeSpaces(timeNode.attr('datetime'));
  if (datetime) return datetime;

  const text = normalizeSpaces($card.text());
  const dateMatch = text.match(/\b\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4}\b/);
  return dateMatch ? dateMatch[0] : '';
}

function mapApiPost(entry) {
  const title = normalizeSpaces(cheerio.load(entry?.title?.rendered || '').text());
  const excerpt = normalizeSpaces(cheerio.load(entry?.excerpt?.rendered || '').text());
  const link = normalizeSpaces(entry?.link || '');
  const date = normalizeSpaces(entry?.date || '');
  const uid = link || `${date}|${title}`;
  return { title, excerpt, link, date, uid };
}

async function fetchPostsFromApi(options) {
  const cfg = { ...DEFAULTS, ...options };
  const endpoint = `${cfg.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

  const response = await axios.get(endpoint, {
    params: {
      per_page: Math.min(Math.max(Number(cfg.limit) || 40, 1), 100),
      orderby: 'date',
      order: 'desc',
      _fields: 'date,link,title,excerpt',
    },
    timeout: cfg.timeoutMs,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`API HTTP ${response.status}`);
  }

  if (!Array.isArray(response.data)) {
    throw new Error('API non ha restituito un array di post');
  }

  return response.data.map(mapApiPost).filter((post) => post.title);
}

function collectFromArticles($, cfg, seen) {
  const posts = [];

  $('article').each((_, article) => {
    const $article = $(article);
    const heading = $article.find('h1, h2, h3, h4, h5, h6').first();
    if (!heading.length) return;

    const title = normalizeSpaces(heading.text());
    if (!title) return;

    const link =
      toAbsolute(heading.find('a').first().attr('href'), cfg.baseUrl) ||
      toAbsolute($article.find('a').first().attr('href'), cfg.baseUrl);
    const date = extractDate($article, $);
    const excerpt = normalizeSpaces(
      $article
        .find('p')
        .map((__, p) => $(p).text())
        .get()
        .join(' ')
    );

    const uid = link || `${date}|${title}`;
    if (!uid || seen.has(uid)) return;

    seen.add(uid);
    posts.push({ title, excerpt, link, date, uid });
  });

  return posts;
}

function collectFromReadMore($, cfg, seen) {
  const posts = [];

  $('a').each((_, anchor) => {
    const $anchor = $(anchor);
    const label = normalizeSpaces($anchor.text());
    if (!/leggi\s+tutto/i.test(label)) return;

    const $card = $anchor.closest('article, li, div, section');
    if (!$card.length) return;

    const heading = $card.find('h1, h2, h3, h4, h5, h6').first();
    const title = normalizeSpaces(heading.text());
    if (!title) return;

    const link =
      toAbsolute($anchor.attr('href'), cfg.baseUrl) ||
      toAbsolute(heading.find('a').first().attr('href'), cfg.baseUrl);
    const date = extractDate($card, $);
    const excerpt = normalizeSpaces(
      $card
        .find('p')
        .map((__, p) => $(p).text())
        .get()
        .join(' ')
    );

    const uid = link || `${date}|${title}`;
    if (!uid || seen.has(uid)) return;

    seen.add(uid);
    posts.push({ title, excerpt, link, date, uid });
  });

  return posts;
}

async function fetchPostsFromHtml(options) {
  const cfg = { ...DEFAULTS, ...options };
  const response = await axios.get(cfg.newsUrl, {
    timeout: cfg.timeoutMs,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTML HTTP ${response.status}`);
  }

  const $ = cheerio.load(response.data);
  const seen = new Set();

  let posts = collectFromArticles($, cfg, seen);

  if (posts.length === 0) {
    posts = collectFromReadMore($, cfg, seen);
  }

  if (posts.length === 0) {
    const fallback = [];
    $('h1, h2, h3, h4, h5, h6').each((_, h) => {
      const title = normalizeSpaces($(h).text());
      if (!title || title.length < 12) return;
      const uid = `title|${title}`;
      if (seen.has(uid)) return;
      seen.add(uid);
      fallback.push({ title, excerpt: '', link: '', date: '', uid });
    });
    posts = fallback;
  }

  return posts.slice(0, Math.min(Math.max(Number(cfg.limit) || 40, 1), 100));
}

function isSalePost(post) {
  const title = normalizeSpaces(post?.title).toLowerCase();
  const excerpt = normalizeSpaces(post?.excerpt).toLowerCase();

  if (TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return true;
  }

  return BODY_KEYWORDS.some((keyword) => excerpt.includes(keyword));
}

async function fetchPosts(options) {
  try {
    const apiPosts = await fetchPostsFromApi(options);
    if (apiPosts.length > 0) return apiPosts;
  } catch (_) {
    // API can be unavailable or empty for this site.
  }

  return fetchPostsFromHtml(options);
}

module.exports = {
  fetchPosts,
  fetchPostsFromApi,
  fetchPostsFromHtml,
  isSalePost,
  normalizeSpaces,
};
