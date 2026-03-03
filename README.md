# Bot Cenacolo (Node.js)

Monitor automatico della pagina notizie del Cenacolo Vinciano con filtro su annunci vendite tipo:

- `In vendita i biglietti per ...`
- `Apertura vendite ...`
- keyword nel testo (`saranno messi in vendita i biglietti`)

Il bot notifica solo i nuovi annunci (evita duplicati con file stato locale).

## 1) Installazione

```bash
cd /Users/kevinmuka/Desktop/bot_cenacolo
npm install
cp .env.example .env
```

## 2) Configurazione notifiche

Compila `.env`:

- Per email (SMTP): `SMTP_*`, `EMAIL_FROM`, `EMAIL_TO`
- Per SMS (Twilio): `TWILIO_*`

Puoi usare uno o entrambi i canali.

## 3) Esecuzione manuale

Solo output terminale:

```bash
npm start
```

Email:

```bash
node cenacolo-ticket-bot.js --notify email
```

SMS:

```bash
node cenacolo-ticket-bot.js --notify sms
```

Email + SMS + stdout:

```bash
node cenacolo-ticket-bot.js --notify stdout,email,sms
```

Note:

- Al primo avvio inizializza lo stato e non manda notifiche retroattive.
- Se vuoi notificare anche al primo avvio: `--notify-on-first-run`

## 4) Schedulazione 2 volte al giorno (cron)

Apri crontab:

```bash
crontab -e
```

Aggiungi (09:00 e 21:00 ogni giorno):

```cron
0 9,21 * * * cd /Users/kevinmuka/Desktop/bot_cenacolo && /usr/bin/env node cenacolo-ticket-bot.js --notify email >> bot.log 2>&1
```

Se vuoi anche SMS:

```cron
0 9,21 * * * cd /Users/kevinmuka/Desktop/bot_cenacolo && /usr/bin/env node cenacolo-ticket-bot.js --notify email,sms >> bot.log 2>&1
```

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
- Aggiungi `sms` solo quando vuoi una notifica piu urgente (costo per messaggio).
