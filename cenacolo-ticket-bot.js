#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');

require('dotenv').config();

const nodemailer = require('nodemailer');

const { fetchPosts, isSalePost } = require('./scripts/fetch-news');
const { displayDate, resolveSaleDate } = require('./scripts/sale-info');

const DEFAULTS = {
  mode: 'check',
  newsUrl: 'https://cenacolovinciano.org/notizie/',
  baseUrl: 'https://cenacolovinciano.org',
  stateFile: '.cenacolo_seen.json',
  limit: 40,
  digestLimit: 5,
  timeoutMs: 20_000,
  notify: 'stdout',
};

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    showAll: false,
    noSave: false,
    notifyOnFirstRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--mode') args.mode = (argv[++i] || DEFAULTS.mode).toLowerCase();
    else if (token === '--news-url') args.newsUrl = argv[++i];
    else if (token === '--base-url') args.baseUrl = argv[++i];
    else if (token === '--state-file') args.stateFile = argv[++i];
    else if (token === '--limit') args.limit = Number(argv[++i] || DEFAULTS.limit);
    else if (token === '--digest-limit') args.digestLimit = Number(argv[++i] || DEFAULTS.digestLimit);
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

  if (!['check', 'digest'].includes(args.mode)) {
    throw new Error(`Mode non supportata: ${args.mode}. Usa --mode check|digest`);
  }

  return args;
}

function printHelp() {
  console.log(`
Uso:
  node cenacolo-ticket-bot.js [opzioni]

Opzioni:
  --mode <check|digest>       check=news nuove, digest=ultime N news
  --news-url <url>            URL pagina notizie
  --base-url <url>            URL base sito
  --state-file <path>         File JSON con post gia visti (mode check)
  --limit <n>                 Numero post da leggere in mode check (default: 40)
  --digest-limit <n>          Numero post da inviare in mode digest (default: 5)
  --timeout-ms <n>            Timeout HTTP in ms (default: 20000)
  --notify <canali>           Canali separati da virgola: stdout,email
  --show-all                  Mostra/notifica anche post gia visti (mode check)
  --notify-on-first-run       Notifica anche al primo avvio (mode check)
  --no-save                   Non aggiorna il file stato (mode check)
  --help, -h                  Mostra questo help
`);
}

function splitNotifyChannels(notifyArg) {
  return new Set(
    String(notifyArg || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isEnabled(value, defaultValue = true) {
  if (value == null || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
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

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error('Variabili SMTP mancanti: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM');
  }

  return { host, port, secure, user, pass, from };
}

async function sendEmail({ to, subject, text }) {
  if (!to) {
    throw new Error('Destinatario email mancante.');
  }

  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text,
  });
}

async function formatNewsList(posts, header) {
  const lines = [header];

  for (const post of posts) {
    lines.push('');
    lines.push(`${displayDate(post?.date)} | ${post?.title || 'n/d'}`);
    lines.push(`    ${post?.link || 'n/d'}`);

    if (isSalePost(post)) {
      const saleDate = await resolveSaleDate(post);
      lines.push(`    Apertura vendite: ${saleDate}`);
    }
  }

  return lines.join('\n');
}

async function runCheckMode(args) {
  const statePath = path.resolve(process.cwd(), args.stateFile);
  const { exists: stateExists, seen: seenBefore } = await loadState(statePath);

  const posts = await fetchPosts({
    newsUrl: args.newsUrl,
    baseUrl: args.baseUrl,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
  });

  if (posts.length === 0) {
    console.log('Nessuna news trovata.');
    return;
  }

  const firstRun = !stateExists;
  let toNotify = posts;

  if (!args.showAll) {
    toNotify = posts.filter((post) => !seenBefore.has(post.uid));
  }

  if (firstRun && !args.notifyOnFirstRun && !args.showAll) {
    toNotify = [];
    console.log('Primo avvio: stato inizializzato senza notifiche retroattive.');
  }

  const channels = splitNotifyChannels(args.notify);
  if (toNotify.length === 0) {
    console.log('Nessuna nuova news.');
  } else {
    const body = await formatNewsList(toNotify, `Nuove news Cenacolo (${toNotify.length})`);

    if (channels.has('stdout')) {
      console.log(body);
    }

    if (channels.has('email')) {
      await sendEmail({
        to: process.env.EMAIL_TO,
        subject: `[Cenacolo] Nuove news (${toNotify.length})`,
        text: body,
      });
      console.log(`Email inviata a EMAIL_TO (${toNotify.length} news).`);
    }

    if (channels.size === 0) {
      console.log('Nessun canale notifica selezionato; usa --notify stdout,email');
    }
  }

  if (!args.noSave) {
    const updatedSeen = new Set([...seenBefore, ...posts.map((post) => post.uid)]);
    await saveState(statePath, updatedSeen);
  }
}

async function runDigestMode(args) {
  if (!isEnabled(process.env.DAILY_TOP5_ENABLED, true)) {
    console.log('Digest giornaliero disattivato (DAILY_TOP5_ENABLED=false).');
    return;
  }

  const posts = await fetchPosts({
    newsUrl: args.newsUrl,
    baseUrl: args.baseUrl,
    limit: args.digestLimit,
    timeoutMs: args.timeoutMs,
  });

  if (posts.length === 0) {
    console.log('Nessuna news trovata per digest.');
    return;
  }

  const digestPosts = posts.slice(0, Math.max(args.digestLimit, 1));
  const body = await formatNewsList(digestPosts, `Ultime ${digestPosts.length} news Cenacolo`);
  const channels = splitNotifyChannels(args.notify);

  if (channels.has('stdout')) {
    console.log(body);
  }

  if (channels.has('email')) {
    await sendEmail({
      to: process.env.EMAIL_TO2,
      subject: `[Cenacolo] Ultime ${digestPosts.length} news`,
      text: body,
    });
    console.log(`Digest inviato a EMAIL_TO2 (${digestPosts.length} news).`);
  }

  if (channels.size === 0) {
    console.log('Nessun canale notifica selezionato; usa --notify stdout,email');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'digest') {
    await runDigestMode(args);
    return;
  }

  await runCheckMode(args);
}

main().catch((error) => {
  console.error('Errore:', error.message || error);
  process.exit(1);
});
