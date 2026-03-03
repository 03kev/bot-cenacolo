#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');

const { fetchPosts, isSalePost } = require('./fetch-news');

function parseLimitArg(argv, fallback) {
  if (!argv.length) return fallback;
  const [first, second] = argv;

  if (first === '--help' || first === '-h') {
    console.log('Uso: node scripts/news-sales.js [N] oppure --limit N');
    process.exit(0);
  }

  if (first === '--limit') {
    const value = Number(second);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Valore --limit non valido. Usa un intero positivo.');
    }
    return value;
  }

  if (first.startsWith('-')) {
    throw new Error(`Argomento non riconosciuto: ${first}. Usa --limit N`);
  }

  const value = Number(first);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Limite non valido. Usa un intero positivo.');
  }
  return value;
}

function displayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'n/d';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  return raw;
}

const MONTHS = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

const SALE_HINTS = [
  'messi in vendita',
  'in vendita i biglietti',
  'biglietti saranno disponibili',
  'apertura vendite',
  'a partire',
];

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseYearFromDate(value) {
  const raw = String(value || '');
  const iso = raw.match(/\b(20\d{2})-\d{2}-\d{2}\b/);
  if (iso) return Number(iso[1]);
  const text = raw.match(/\b(20\d{2})\b/);
  return text ? Number(text[1]) : null;
}

function pickBestDateMatch(text) {
  const haystack = normalizeSpaces(text);
  const dateRegex =
    /\b(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)?\s*(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(20\d{2}))?\b/gi;
  const matches = [];
  let m = dateRegex.exec(haystack);
  while (m) {
    const start = Math.max(0, m.index - 120);
    const end = Math.min(haystack.length, dateRegex.lastIndex + 160);
    const ctx = haystack.slice(start, end).toLowerCase();
    const score = SALE_HINTS.reduce((acc, hint) => (ctx.includes(hint) ? acc + 1 : acc), 0);
    matches.push({ match: m, ctx, score });
    m = dateRegex.exec(haystack);
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.score - a.score);
  return matches[0];
}

function extractTime(ctx) {
  const lower = String(ctx || '').toLowerCase();
  if (lower.includes('mezzogiorno')) return '12:00';
  const full = lower.match(/\bore\s*(\d{1,2})[.:](\d{2})\b/);
  if (full) return `${full[1].padStart(2, '0')}:${full[2]}`;
  const hourOnly = lower.match(/\bore\s*(\d{1,2})\b/);
  if (hourOnly) return `${hourOnly[1].padStart(2, '0')}:00`;
  return null;
}

function extractSaleDate(text, fallbackYear) {
  const best = pickBestDateMatch(text);
  if (!best) return null;

  const [, dayRaw, monthRaw, yearRaw] = best.match;
  const day = Number(dayRaw);
  const monthName = monthRaw.toLowerCase();
  const month = MONTHS[monthName];
  if (!month || Number.isNaN(day)) return null;

  const year = yearRaw ? Number(yearRaw) : fallbackYear;
  const time = extractTime(best.ctx);
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const dateLabel = year ? `${day} ${monthLabel} ${year}` : `${day} ${monthLabel}`;
  const when = time ? `${dateLabel} ore ${time}` : dateLabel;

  return { when, time };
}

async function fetchArticleText(url) {
  if (!url) return '';
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return '';
    const $ = cheerio.load(response.data);
    const articleText = normalizeSpaces($('article').text());
    if (articleText.length > 80) return articleText;
    return normalizeSpaces($('main').text());
  } catch (_) {
    return '';
  }
}

async function resolveSaleDate(post) {
  const fallbackYear = parseYearFromDate(post?.date);
  const fromExcerpt = extractSaleDate(post?.excerpt, fallbackYear);
  if (fromExcerpt) return fromExcerpt.when;

  const articleText = await fetchArticleText(post?.link);
  const fromArticle = extractSaleDate(articleText, fallbackYear);
  return fromArticle ? fromArticle.when : 'n/d';
}

async function main() {
  const limit = parseLimitArg(process.argv.slice(2), 60);
  const posts = await fetchPosts({ limit });
  const filtered = posts.filter(isSalePost);

  console.log('NEWS FILTRATE (VENDITE BIGLIETTI):');
  if (filtered.length === 0) {
    console.log('Nessuna trovata.');
    return;
  }

  for (let i = 0; i < filtered.length; i += 1) {
    const post = filtered[i];
    const date = displayDate(post?.date);
    const title = post?.title || '';
    const link = post?.link || '';
    const saleDate = await resolveSaleDate(post);
    console.log(`${String(i + 1).padStart(2, '0')}. ${date} | ${title}`);
    console.log(`    ${link}`);
    console.log(`    Apertura vendite: ${saleDate}`);
  }
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
