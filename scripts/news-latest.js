#!/usr/bin/env node

const { fetchPosts } = require('./fetch-news');
const { displayDate } = require('./sale-info');

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
