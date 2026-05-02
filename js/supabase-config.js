// ============================================================
// supabase-config.js — Configuration Supabase sécurisée
// Les clés sont chargées via l'API Vercel (/api/config)
// → Jamais exposées dans le code source GitHub
// ============================================================

// Promesse globale : toutes les pages attendent que db soit prêt
let _dbResolve;
const dbReady = new Promise(resolve => { _dbResolve = resolve; });

// Variable globale db (disponible après dbReady)
let db = null;

// ============================================================
// Initialisation — Chargement sécurisé depuis /api/config
// ============================================================
async function initSupabaseClient() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { url, key, error } = await res.json();

    if (error) throw new Error(error);
    if (!url || !key) throw new Error('Configuration Supabase manquante');

    const { createClient } = window.supabase;
    db = createClient(url, key);
    _dbResolve(db);
    console.log('[Supabase] Client initialisé ✅');

  } catch (err) {
    console.error('[Supabase] Erreur de configuration:', err.message);
    // Afficher un message d'erreur visuel
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#B71C1C;color:white;padding:12px 20px;font-size:14px;font-weight:600;text-align:center;';
    banner.textContent = `⚠️ Erreur de connexion Supabase : ${err.message}`;
    document.body.prepend(banner);
  }
}

// Lancer immédiatement
initSupabaseClient();

// ============================================================
// Constantes métier
// ============================================================
const TYPES = {
  psychiatrie: {
    code: 'psychiatrie',
    label_fr: 'Consultation Psychiatrique',
    label_ar: 'استشارة في الطب النفسي',
    couleur: '#2E7D32',
    couleur_gradient: 'linear-gradient(160deg, #1B5E20 0%, #388E3C 60%, #43A047 100%)',
    couleur_light: '#E8F5E9',
    couleur_border: '#81C784',
    prefixe: 'P',
    salles: [1, 3, 4, 5, 6]
  },
  psychotherapie: {
    code: 'psychotherapie',
    label_fr: 'Psychothérapie Individuelle',
    label_ar: 'حصة علاج نفسي فردية',
    couleur: '#1565C0',
    couleur_gradient: 'linear-gradient(160deg, #0D47A1 0%, #1565C0 60%, #1976D2 100%)',
    couleur_light: '#E3F2FD',
    couleur_border: '#64B5F6',
    prefixe: 'T',
    salles: [2]
  }
};

const STATUTS = {
  en_attente:      { label_fr: 'En attente',       label_ar: 'في الانتظار',   css: 'badge-attente' },
  appele:          { label_fr: 'Appelé',            label_ar: 'تم الاستدعاء', css: 'badge-appele' },
  en_consultation: { label_fr: 'En consultation',   label_ar: 'في الاستشارة', css: 'badge-consultation' },
  termine:         { label_fr: 'Terminé',           label_ar: 'منتهي',         css: 'badge-termine' },
  annule:          { label_fr: 'Annulé',            label_ar: 'ملغى',          css: 'badge-annule' }
};

const SALLES_CONFIG = {
  1: { slug: 'salle01', type: 'psychiatrie' },
  2: { slug: 'salle02', type: 'psychotherapie' },
  3: { slug: 'salle03', type: 'psychiatrie' },
  4: { slug: 'salle04', type: 'psychiatrie' },
  5: { slug: 'salle05', type: 'psychiatrie' },
  6: { slug: 'salle06', type: 'psychiatrie' }
};

// ============================================================
// Utilitaires
// ============================================================
function getAujourdhui() {
  return new Date().toISOString().split('T')[0];
}

function formatNumero(prefixe, numero) {
  return `${prefixe}-${String(numero).padStart(2, '0')}`;
}

function getTypeInfo(code) {
  return TYPES[code] || TYPES.psychiatrie;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function formatHeure(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
