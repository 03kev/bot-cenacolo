#!/usr/bin/env node

const { fetchPosts, isSalePost } = require('./fetch-news');

async function main() {
  const limit = Number(process.argv[2] || 60);
  const posts = await fetchPosts({ limit });
  const filtered = posts.filter(isSalePost);

  console.log('NEWS FILTRATE (VENDITE BIGLIETTI):');
  if (filtered.length === 0) {
    console.log('Nessuna trovata.');
    return;
  }

  for (let i = 0; i < filtered.length; i += 1) {
    const post = filtered[i];
    const date = String(post?.date || '').slice(0, 10);
    const title = post?.title || '';
    const link = post?.link || '';
    console.log(`${String(i + 1).padStart(2, '0')}. ${date} | ${title}`);
    console.log(`    ${link}`);
  }
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
