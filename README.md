# Bot Cenacolo (Node.js)

Monitor automatico della pagina notizie del Cenacolo Vinciano.

Il bot notifica tutte le nuove news (evita duplicati con file stato locale) e, quando una news e di vendita biglietti, aggiunge anche la data di apertura vendite estratta dal testo/articolo.

## 1) Installazione

```bash
cd /Users/kevinmuka/Desktop/bot_cenacolo
npm install
cp .env.example .env
```

## 2) Configurazione notifiche

Compila `.env`:

- Per email (SMTP): `SMTP_*`, `EMAIL_FROM`, `EMAIL_TO`

## 3) Esecuzione manuale

Solo output terminale:

```bash
npm start
```

Email:

```bash
node cenacolo-ticket-bot.js --notify email
```

Email + stdout:

```bash
node cenacolo-ticket-bot.js --notify stdout,email
```

Note:

- Al primo avvio inizializza lo stato e non manda notifiche retroattive.
- Se vuoi notificare anche al primo avvio: `--notify-on-first-run`
- Il filtro "solo nuove news" usa il file stato `.cenacolo_seen.json`.
- Se usi `--show-all`, il filtro anti-duplicati viene ignorato.
- Formato output/email per news vendita:

```text
12 Dicembre 2022 | In vendita i biglietti per i mesi di febbraio, marzo e aprile 2023
    https://cenacolovinciano.org/news-ed-eventi/in-vendita-i-biglietti-per-i-mesi-di-febbraio-marzo-e-aprile-2023/
    Apertura vendite: 15 Dicembre 2022 ore 12:00
```

## 4) Schedulazione 2 volte al giorno (cron)

Apri crontab:

```bash
crontab -e
```

Aggiungi (09:00 e 21:00 ogni giorno):

```cron
0 9,21 * * * cd /Users/kevinmuka/Desktop/bot_cenacolo && /usr/bin/env node cenacolo-ticket-bot.js --notify email >> bot.log 2>&1
```

## 4b) Esecuzione online (GitHub Actions)

Se non vuoi tenere il Mac acceso, puoi usare il workflow:

- [cenacolo-bot.yml](/Users/kevinmuka/Desktop/bot_cenacolo/.github/workflows/cenacolo-bot.yml)

Il workflow:

- gira 2 volte al giorno,
- invia email,
- salva lo stato anti-duplicati in `.github/state/cenacolo_seen.json`.

Setup:

1. Pusha il repository su GitHub.
2. In GitHub vai su `Settings > Secrets and variables > Actions` e crea i secrets:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_FROM`
   - `EMAIL_TO`
3. Vai su `Actions > Cenacolo Bot > Run workflow` per il primo test.

Nota: il cron di GitHub Actions usa UTC.

## 5) Opzioni utili

```bash
node cenacolo-ticket-bot.js --help
```

Opzioni principali:

- `--show-all`: mostra/notifica anche news gia viste
- `--no-save`: non aggiorna il file stato
- `--state-file <path>`: cambia file stato (default `.cenacolo_seen.json`)
- `--limit <n>`: quanti post leggere (default `40`)
- `--timeout-ms <n>`: timeout richieste HTTP

## 6) Strategia consigliata costo/affidabilita

- Usa `email` come canale principale.
- Configurazione minima: SMTP Gmail o altro provider SMTP.
