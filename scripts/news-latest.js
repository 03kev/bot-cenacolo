#!/usr/bin/env node

const { fetchPosts } = require('./fetch-news');

async function main() {
  const limit = Number(process.argv[2] || 15);
  const posts = await fetchPosts({ limit });
  console.log('ULTIME NEWS:');

  if (posts.length === 0) {
    console.log('Nessuna news trovata.');
    return;
  }

  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const date = String(post?.date || '').slice(0, 10);
    const title = post?.title || '';
    console.log(`${String(i + 1).padStart(2, '0')}. ${date} | ${title}`);
  }
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
