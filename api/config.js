// ============================================================
// api/config.js — Vercel Serverless Function
// Retourne la configuration Supabase depuis les variables
// d'environnement Vercel (jamais exposées dans le code source)
// ============================================================

export default function handler(req, res) {
  // Sécurité CORS — autoriser uniquement votre domaine Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store'); // Ne pas mettre en cache les clés

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: 'Variables d\'environnement manquantes. Configurez SUPABASE_URL et SUPABASE_ANON_KEY dans Vercel.'
    });
  }

  return res.status(200).json({ url, key });
}
