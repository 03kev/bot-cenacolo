#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');

require('dotenv').config();

const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const DEFAULTS = {
  newsUrl: 'https://cenacolovinciano.org/notizie/',
  baseUrl: 'https://cenacolovinciano.org',
  stateFile: '.cenacolo_seen.json',
  limit: 40,
  timeoutMs: 20_000,
  notify: 'stdout',
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

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    showAll: false,
    noSave: false,
    notifyOnFirstRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--news-url') args.newsUrl = argv[++i];
    else if (token === '--base-url') args.baseUrl = argv[++i];
    else if (token === '--state-file') args.stateFile = argv[++i];
    else if (token === '--limit') args.limit = Number(argv[++i] || DEFAULTS.limit);
    else if (token === '--timeout-ms') args.timeoutMs = Number(argv[++i] || DEFAULTS.timeoutMs);
    else if (token === '--notify') args.notify = argv[++i] || DEFAULTS.notify;
    else if (token === '--show-all') args.showAll = true;
    else if (token === '--no-save') args.noSave = true;
    else if (token === '--notify-on-first-run') args.notifyOnFirstRun = true;
    else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Uso:
  node cenacolo-ticket-bot.js [opzioni]

Opzioni:
  --news-url <url>            URL pagina notizie
  --base-url <url>            URL base sito (per API WP)
  --state-file <path>         File JSON con post gia visti
  --limit <n>                 Numero massimo post da leggere (default: 40)
  --timeout-ms <n>            Timeout HTTP in ms (default: 20000)
  --notify <canali>           Canali separati da virgola: stdout,email,sms
  --show-all                  Mostra/notifica anche post gia visti
  --notify-on-first-run       Notifica anche al primo avvio
  --no-save                   Non aggiorna il file stato
  --help, -h                  Mostra questo help
`);
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function matchesSale(post) {
  const title = normalizeSpaces(post.title).toLowerCase();
  const excerpt = normalizeSpaces(post.excerpt).toLowerCase();

  if (TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return true;
  }

  return BODY_KEYWORDS.some((keyword) => excerpt.includes(keyword));
}

async function fetchPostsFromApi(baseUrl, limit, timeoutMs) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const response = await axios.get(endpoint, {
    params: {
      per_page: Math.min(Math.max(limit, 1), 100),
      orderby: 'date',
      order: 'desc',
      _fields: 'date,link,title,excerpt',
    },
    timeout: timeoutMs,
  });

  return response.data.map((entry) => {
    const title = cheerio.load(entry?.title?.rendered || '').text();
    const excerpt = cheerio.load(entry?.excerpt?.rendered || '').text();
    const link = entry?.link || '';
    const date = entry?.date || '';
    return {
      title: normalizeSpaces(title),
      excerpt: normalizeSpaces(excerpt),
      link,
      date,
      uid: link || `${date}|${normalizeSpaces(title)}`,
    };
  });
}

async function fetchPostsFromHtml(newsUrl, timeoutMs) {
  const response = await axios.get(newsUrl, { timeout: timeoutMs });
  const $ = cheerio.load(response.data);
  const seen = new Set();
  const posts = [];

  $('article').each((_, article) => {
    const heading = $(article).find('h1, h2, h3, h4, h5, h6').first();
    if (!heading.length) return;

    const link = heading.find('a').attr('href') || $(article).find('a').first().attr('href') || '';
    const date = $(article).find('time').first().attr('datetime') || '';
    const title = normalizeSpaces(heading.text());
    const excerpt = normalizeSpaces(
      $(article)
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

async function loadState(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return { exists: true, seen: new Set() };
    }
    return { exists: true, seen: new Set(parsed.map(String)) };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, seen: new Set() };
    }
    return { exists: true, seen: new Set() };
  }
}

async function saveState(filePath, seen) {
  const sorted = [...new Set([...seen])].sort();
  await fs.writeFile(filePath, JSON.stringify(sorted, null, 2), 'utf8');
}

function splitNotifyChannels(notifyArg) {
  return new Set(
    String(notifyArg || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

function formatDigest(posts) {
  const lines = [`Nuovo annuncio vendite Cenacolo (${posts.length})`];
  for (const post of posts) {
    lines.push('');
    lines.push(`Titolo: ${post.title || 'n/d'}`);
    lines.push(`Data: ${post.date || 'n/d'}`);
    lines.push(`Link: ${post.link || 'n/d'}`);
  }
  return lines.join('\n');
}

async function notifyStdout(posts) {
  console.log(formatDigest(posts));
}

async function notifyEmail(posts) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;

  if (!host || !user || !pass || !from || !to) {
    throw new Error('Variabili SMTP mancanti: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const subject = `[Cenacolo] Nuovo annuncio vendite (${posts.length})`;
  const text = formatDigest(posts);

  await transporter.sendMail({ from, to, subject, text });
}

async function notifySms(posts) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.TWILIO_TO;

  if (!accountSid || !authToken || !from || !to) {
    throw new Error('Variabili Twilio mancanti: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO');
  }

  const client = twilio(accountSid, authToken);

  for (const post of posts) {
    const body = `[Cenacolo] ${post.title} - ${post.link || 'link non disponibile'}`;
    await client.messages.create({ from, to, body: body.slice(0, 1550) });
  }
}

async function fetchPosts(args) {
  try {
    const apiPosts = await fetchPostsFromApi(args.baseUrl, args.limit, args.timeoutMs);
    if (apiPosts.length > 0) {
      return apiPosts;
    }
  } catch (error) {
    // fallback below
  }

  return fetchPostsFromHtml(args.newsUrl, args.timeoutMs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statePath = path.resolve(process.cwd(), args.stateFile);
  const { exists: stateExists, seen: seenBefore } = await loadState(statePath);

  const posts = await fetchPosts(args);
  const matching = posts.filter(matchesSale);

  if (matching.length === 0) {
    console.log('Nessun annuncio vendite trovato.');
    return;
  }

  const firstRun = !stateExists;

  let toNotify = matching;
  if (!args.showAll) {
    toNotify = matching.filter((post) => !seenBefore.has(post.uid));
  }

  if (firstRun && !args.notifyOnFirstRun && !args.showAll) {
    toNotify = [];
    console.log('Primo avvio: stato inizializzato senza notifiche retroattive.');
  }

  const channels = splitNotifyChannels(args.notify);
  if (toNotify.length === 0) {
    console.log('Nessun nuovo annuncio vendite.');
  } else {
    if (channels.has('stdout')) {
      await notifyStdout(toNotify);
    }
    if (channels.has('email')) {
      await notifyEmail(toNotify);
      console.log(`Email inviata (${toNotify.length} annuncio/i).`);
    }
    if (channels.has('sms')) {
      await notifySms(toNotify);
      console.log(`SMS inviati (${toNotify.length} annuncio/i).`);
    }
    if (channels.size === 0) {
      console.log('Nessun canale notifica selezionato; usa --notify stdout,email,sms');
    }
  }

  if (!args.noSave) {
    const updatedSeen = new Set([...seenBefore, ...matching.map((post) => post.uid)]);
    await saveState(statePath, updatedSeen);
  }
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
