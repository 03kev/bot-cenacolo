# Bot Cenacolo (Node.js)

Bot per monitorare la pagina notizie del Cenacolo Vinciano.

Comportamento:

- `mode check`: controlla le news nuove e invia email a `EMAIL_TO` solo se ci sono novita.
- `mode digest`: invia una mail con le ultime 5 news a `EMAIL_TO2`.
- sulle news vendita aggiunge anche `Apertura vendite: ...`.

## 1) Installazione

```bash
cd /Users/kevinmuka/Desktop/bot_cenacolo
npm install
cp .env.example .env
```

## 2) Configurazione `.env`

Variabili necessarie SMTP:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

Destinatari:

- `EMAIL_TO`: destinatario alert news nuove (mode `check`)
- `EMAIL_TO2`: destinatario digest giornaliero top 5 (mode `digest`)

Toggle digest:

- `DAILY_TOP5_ENABLED=true|false`

Se metti `false`, il digest giornaliero viene saltato senza errori.

## 3) Esecuzione manuale

Check nuove news (invio a `EMAIL_TO`):

```bash
node cenacolo-ticket-bot.js --mode check --notify email
```

Digest ultime 5 news (invio a `EMAIL_TO2`):

```bash
node cenacolo-ticket-bot.js --mode digest --digest-limit 5 --notify email
```

Output a terminale:

```bash
node cenacolo-ticket-bot.js --mode check --notify stdout
```

## 4) Schedulazione locale (cron)

Controllo nuove news 4 volte al giorno:

```cron
0 */6 * * * cd /Users/kevinmuka/Desktop/bot_cenacolo && /usr/bin/env node cenacolo-ticket-bot.js --mode check --notify email >> bot.log 2>&1
```

Digest giornaliero top 5:

```cron
0 9 * * * cd /Users/kevinmuka/Desktop/bot_cenacolo && /usr/bin/env node cenacolo-ticket-bot.js --mode digest --digest-limit 5 --notify email >> bot.log 2>&1
```

## 5) Esecuzione online (GitHub Actions)

Workflow check (4 volte/giorno):

- [cenacolo-bot.yml](/Users/kevinmuka/Desktop/bot_cenacolo/.github/workflows/cenacolo-bot.yml)
- Orari effettivi Europe/Rome: `00:00`, `06:00`, `12:00`, `18:00`

Workflow digest (1 volta/giorno):

- [cenacolo-digest.yml](/Users/kevinmuka/Desktop/bot_cenacolo/.github/workflows/cenacolo-digest.yml)
- Orario effettivo Europe/Rome: `08:00`

Stato anti-duplicati (usato dal check online):

- [cenacolo_seen.json](/Users/kevinmuka/Desktop/bot_cenacolo/.github/state/cenacolo_seen.json)

Setup GitHub:

1. Pusha la repository su GitHub.
2. In `Settings > Secrets and variables > Actions`, crea i secrets:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_FROM`
   - `EMAIL_TO`
   - `EMAIL_TO2`
3. Crea una repository variable (non secret):
   - `DAILY_TOP5_ENABLED=true` (metti `false` per disattivare facilmente il digest)
4. Lancia un test manuale da `Actions > Run workflow`.

Nota: i cron GitHub sono in UTC, ma i workflow includono una guardia `Europe/Rome` per rispettare questi orari anche con ora legale/solare.

## 6) Opzioni utili

```bash
node cenacolo-ticket-bot.js --help
```
