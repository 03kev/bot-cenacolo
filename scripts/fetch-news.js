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

function extractDateFromCard($card, $) {
  const timeDate = normalizeSpaces($card.find('time').first().attr('datetime'));
  if (timeDate) return timeDate;

  const liItems = $card
    .find('ul.paginator li')
    .map((_, li) => normalizeSpaces($(li).text()))
    .get();

  const fromList = liItems.find((text) => /\b20\d{2}\b/.test(text));
  if (fromList) return fromList;

  const blockText = normalizeSpaces($card.text());
  const dateMatch = blockText.match(/\b\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+20\d{2}\b/);
  return dateMatch ? dateMatch[0] : '';
}

function extractExcerptFromCard($card, $) {
  const mainCol = $card.find('div.col-11').first();
  const paragraphs = (mainCol.length ? mainCol : $card)
    .find('p')
    .map((_, p) => normalizeSpaces($(p).text()))
    .get()
    .filter(Boolean);

  return normalizeSpaces(paragraphs.join(' '));
}

function parseNewsLoopCards($, cfg) {
  const posts = [];
  const seen = new Set();

  const cards = $('#news-loop #news-row > div.col-12.margin-b-100');
  if (!cards.length) return posts;

  cards.each((_, card) => {
    const $card = $(card);
    const title = normalizeSpaces($card.find('h3.green-banner, h3.link-banner, h3').first().text());
    if (!title) return;

    const link = toAbsolute($card.find('a.btn--read[href]').first().attr('href'), cfg.baseUrl);
    const date = extractDateFromCard($card, $);
    const excerpt = extractExcerptFromCard($card, $);
    const uid = link || `${date}|${title}`;

    if (!uid || seen.has(uid)) return;
    seen.add(uid);

    posts.push({ title, excerpt, link, date, uid });
  });

  return posts;
}

function parseReadMoreFallback($, cfg) {
  const posts = [];
  const seen = new Set();

  $('a.btn--read[href]').each((_, anchor) => {
    const $anchor = $(anchor);
    const $card = $anchor.closest('div.col-12.margin-b-100, article, li, section, div');
    if (!$card.length) return;

    const title = normalizeSpaces($card.find('h3, h2, h1').first().text());
    if (!title) return;

    const link = toAbsolute($anchor.attr('href'), cfg.baseUrl);
    const date = extractDateFromCard($card, $);
    const excerpt = extractExcerptFromCard($card, $);
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

  let posts = parseNewsLoopCards($, cfg);
  if (posts.length === 0) {
    posts = parseReadMoreFallback($, cfg);
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
    const htmlPosts = await fetchPostsFromHtml(options);
    if (htmlPosts.length > 0) return htmlPosts;
  } catch (_) {
    // API fallback below
  }

  return fetchPostsFromApi(options);
}

module.exports = {
  fetchPosts,
  fetchPostsFromApi,
  fetchPostsFromHtml,
  isSalePost,
  normalizeSpaces,
};
