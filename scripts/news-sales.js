#!/usr/bin/env node

const { fetchPosts, isSalePost } = require('./fetch-news');
const { displayDate, resolveSaleDate } = require('./sale-info');

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
