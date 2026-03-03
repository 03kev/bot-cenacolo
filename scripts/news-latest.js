#!/usr/bin/env node

const { fetchPosts } = require('./fetch-news');

function parseLimitArg(argv, fallback) {
  if (!argv.length) return fallback;
  const [first, second] = argv;

  if (first === '--help' || first === '-h') {
    console.log('Uso: node scripts/news-latest.js [N] oppure --limit N');
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

async function main() {
  const limit = parseLimitArg(process.argv.slice(2), 15);
  const posts = await fetchPosts({ limit });
  console.log('ULTIME NEWS:');

  if (posts.length === 0) {
    console.log('Nessuna news trovata.');
    return;
  }

  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const date = displayDate(post?.date);
    const title = post?.title || '';
    console.log(`${String(i + 1).padStart(2, '0')}. ${date} | ${title}`);
  }
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
