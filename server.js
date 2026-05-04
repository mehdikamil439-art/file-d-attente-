// ============================================================
// server.js — Serveur local Node.js (zéro dépendance)
// Lit .env.local, sert les fichiers statiques + /api/config
// Lancement : node server.js
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

// ============================================================
// 1. Lire .env.local
// ============================================================
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  Fichier .env.local introuvable !');
    console.error('    Créez-le avec SUPABASE_URL et SUPABASE_ANON_KEY');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
  console.log('✅  Variables .env.local chargées');
}

loadEnv();

// ============================================================
// 2. Types MIME — avec charset UTF-8 pour tous les fichiers texte
// ============================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.sql':  'text/plain; charset=utf-8'
};

// ============================================================
// 3. Serveur HTTP
// ============================================================
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]); // Ignorer les query strings et décoder

  // ── Route API : /api/config ─────────────────────────────
  if (url === '/api/config') {
    const url_sb = process.env.SUPABASE_URL;
    const key    = process.env.SUPABASE_ANON_KEY;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (!url_sb || !key) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'SUPABASE_URL ou SUPABASE_ANON_KEY manquant dans .env.local' }));
    }

    res.writeHead(200);
    return res.end(JSON.stringify({ url: url_sb, key }));
  }

  // ── Fichiers statiques ───────────────────────────────────
  // Rediriger / vers /index.html
  let filePath = url === '/' ? '/index.html' : url;

  // Ajouter .html si pas d'extension (ex: /reception → /reception.html)
  if (!path.extname(filePath)) filePath += '.html';

  const fullPath = path.join(ROOT, filePath);

  // Sécurité : empêcher la traversée de répertoire
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('403 Forbidden');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end(`404 — Fichier introuvable : ${filePath}`);
    }
    const ext  = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  🏥  File d\'Attente CHU — Serveur Local      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  ✅  http://localhost:${PORT}                    ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🏥  Réception   → /reception.html           ║`);
  console.log(`║  📺  Affichage   → /affichage.html           ║`);
  console.log(`║  ⚙️   Admin       → /admin.html              ║`);
  console.log(`║  🚪  Salle 1     → /salle01.html             ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n  Ctrl+C pour arrêter le serveur\n');
});
