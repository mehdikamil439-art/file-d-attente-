// ============================================================
// affichage.js — Écran d'Affichage Public TV (100% Arabe)
// Mise à jour en temps réel via Supabase Realtime
// ============================================================

// Format salle : قاعة 01, قاعة 02...
function formatSalleAr(num) {
  return `قاعة ${String(num).padStart(2, '0')}`;
}

let appelsActifs = {}; // { patient_id: {...data} }
let realtimeChannel = null;
let audioCtx = null;
let _dateActuelle = getAujourdhui(); // Pour détecter le changement de jour

// Configuration Sonore
const NOTIFICATION_SOUND_URL = 'https://proxy.notificationsounds.com/notification-sounds/ringtone-you-would-be-glad-to-know/download/file-sounds-1350-you-would-be-glad.mp3';
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let lastSoundTime = 0;
const SOUND_COOLDOWN = 3000; // 3 secondes pour éviter le spam sonore
const SOUND_VOLUME = 0.4;     // Volume doux (40%)

// ============================================================
// DÉTECTION MINUIT — Réinitialisation automatique de l'écran
// ============================================================
function surveillerMinuit() {
  setInterval(() => {
    const aujourdhui = getAujourdhui();
    if (aujourdhui !== _dateActuelle) {
      // Nouveau jour détecté → vider l'écran
      console.log('[Minuit] Nouveau jour détecté — réinitialisation écran');
      _dateActuelle = aujourdhui;
      appelsActifs = {};
      renderGrid();
      // Recharger pour s'assurer que tout est propre
      loadAppelsCourants();
    }
  }, 30000); // Vérification toutes les 30 secondes
}

// Noms arabes des médecins (rempli depuis la DB)
const medecinAr = {};

// ============================================================
// INITIALISATION
// ============================================================
async function initAffichage() {
  startClock();
  await loadAppelsCourants();
  subscribeRealtime();
  buildTicker();
  surveillerMinuit(); // ← Détection automatique du changement de jour
}

// ============================================================
// HORLOGE
// ============================================================
function startClock() {
  function update() {
    const now = new Date();
    const timeEl = document.getElementById('tv-time');
    const dateEl = document.getElementById('tv-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('ar-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  update();
  setInterval(update, 1000);
}

// ============================================================
// CHARGER LES APPELS EN COURS
// ============================================================
async function loadAppelsCourants() {
  // Chercher tous les patients "appelés" ou "en_consultation" aujourd'hui
  const { data, error } = await db
    .from('patients')
    .select(`*, medecins(nom, prenom), salles(numero, type_consultation)`)
    .in('statut', ['appele', 'en_consultation'])
    .eq('date_consultation', getAujourdhui())
    .order('heure_appel', { ascending: false });

  if (error) { console.error(error); return; }

  appelsActifs = {};
  (data || []).forEach(p => { appelsActifs[p.id] = p; });
  renderGrid();
}

// ============================================================
// SUPABASE REALTIME
// ============================================================
function subscribeRealtime() {
  if (realtimeChannel) realtimeChannel.unsubscribe();

  realtimeChannel = db
    .channel('affichage-realtime')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'patients'
    }, async (payload) => {
      const p = payload.new;

      if (p.statut === 'appele' || p.statut === 'en_consultation') {
        // Charger les infos médecin + salle
        const { data } = await db
          .from('patients')
          .select(`*, medecins(nom, prenom), salles(numero, type_consultation)`)
          .eq('id', p.id)
          .single();
        if (data) {
          const isNew = !appelsActifs[p.id];
          appelsActifs[p.id] = data;
          renderGrid();
          if (isNew && p.statut === 'appele') {
            const numero = data.numero_passage;
            const salle = data.salles ? data.salles.numero : 1;
            playVoiceAnnouncement(numero, salle);
            highlightCard(p.id);
          }
        }
      } else {
        // Statut terminé/annulé → retirer de l'affichage
        if (appelsActifs[p.id]) {
          delete appelsActifs[p.id];
          renderGrid();
        }
      }
    })
    .subscribe((status) => {
      const indicator = document.getElementById('live-indicator');
      if (indicator) {
        indicator.style.display = status === 'SUBSCRIBED' ? 'flex' : 'none';
      }
    });
}

// ============================================================
// RENDU DE LA GRILLE
// ============================================================
function renderGrid() {
  const grid = document.getElementById('calls-grid');
  const empty = document.getElementById('tv-empty');
  const calls = Object.values(appelsActifs);

  if (calls.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }

  if (empty) empty.style.display = 'none';

  // Trier : plus récents en premier
  calls.sort((a, b) => new Date(b.heure_appel || b.created_at) - new Date(a.heure_appel || a.created_at));

  grid.innerHTML = calls.map(p => buildCallCard(p)).join('');
}

function buildCallCard(p) {
  const type = p.type_consultation;
  const t = TYPES[type];
  const numDisplay = String(p.numero_passage).padStart(2, '0');
  const salleNum = p.salles ? p.salles.numero : 1;
  const salleAr  = formatSalleAr(salleNum);
  const medNom = p.medecins ? `Dr. ${p.medecins.prenom} ${p.medecins.nom}` : '';

  // Vague SVG de séparation (header → body)
  const waveColor = '#ffffff';

  return `
    <div class="call-card ${type}" id="card-${p.id}">

      <!-- En-tête coloré style badge -->
      <div class="badge-tv-header">
        <img src="assets/logoGST.png" alt="GST" class="badge-tv-logo">
        <div class="badge-tv-title">GST</div>
      </div>

      <!-- Vague de transition -->
      <div class="badge-tv-wave">
        <svg viewBox="0 0 240 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,20 Q60,0 120,10 Q180,20 240,4 L240,20 Z" fill="${waveColor}"/>
        </svg>
      </div>

      <!-- Corps blanc -->
      <div class="badge-tv-body">
        <div class="badge-tv-number">${numDisplay}</div>
        <div class="badge-tv-room">${salleAr}</div>
        <div class="badge-tv-type-ar">${t.label_ar}</div>
        <div class="badge-tv-type-fr">${t.label_fr}</div>
        <div class="badge-tv-sep"></div>
        <div class="badge-tv-doctor">${medNom}</div>
      </div>

      <!-- Pied de page coloré -->
      <div class="badge-tv-footer">
        <div class="badge-tv-footer-ar">المستشفى الجامعي محمد السادس للأمراض العقلية والنفسية - طنجة</div>
        <div class="badge-tv-footer-fr">Hôpital Universitaire de Psychiatrie Mohammed VI  -Tanger-</div>
      </div>

    </div>`;
}

// ============================================================
// ANIMATION + SON
// ============================================================
function highlightCard(patientId) {
  setTimeout(() => {
    const card = document.getElementById(`card-${patientId}`);
    if (card) {
      card.style.transform = 'scale(1.04)';
      card.style.transition = 'transform .3s ease';
      setTimeout(() => { card.style.transform = ''; }, 600);
    }
  }, 100);
}

// ============================================================
// NOTIFICATION SONORE MODERNE (MP3 avec Fallback)
// ============================================================
function playChime() {
  if (!soundEnabled) return Promise.resolve();
  
  // Cooldown pour éviter les répétitions agressives
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN) return Promise.resolve();
  lastSoundTime = now;

  return new Promise(resolve => {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = SOUND_VOLUME;

    // Timer de sécurité pour ne pas bloquer l'interface si l'audio met trop de temps
    const securityTimeout = setTimeout(() => {
      console.warn('Audio loading timeout - using fallback');
      playFallbackBips().then(resolve);
    }, 2000);

    audio.oncanplaythrough = () => {
      clearTimeout(securityTimeout);
      audio.play().catch(e => {
        console.error('Playback failed:', e);
        playFallbackBips().then(resolve);
      });
    };

    audio.onended = () => resolve();
    
    audio.onerror = () => {
      clearTimeout(securityTimeout);
      console.warn('Audio error - using fallback');
      playFallbackBips().then(resolve);
    };
  });
}

// Système de secours si le MP3 échoue (3 bips simples)
function playFallbackBips() {
  return new Promise(resolve => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return resolve();
      const ctx = new AudioContext();
      const freq = 880;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.3);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.3);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.3 + 0.01);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.3 + 0.2);
        osc.start(ctx.currentTime + i * 0.3);
        osc.stop(ctx.currentTime + i * 0.3 + 0.2);
      }
      setTimeout(() => { ctx.close(); resolve(); }, 1000);
    } catch(e) { resolve(); }
  });
}

function playVoiceAnnouncement(numero, salle) {
  // ANNONCE VOCALE SUPPRIMÉE À LA DEMANDE DE L'UTILISATEUR
  console.log(`[Notification] Patient ${numero} -> Salle ${salle}`);
}

// Fonction utilitaire pour activer/désactiver le son
function toggleSound(enabled) {
  soundEnabled = enabled;
  localStorage.setItem('soundEnabled', enabled);
  updateSoundUI();
  console.log('Son ' + (enabled ? 'activé' : 'désactivé'));
  return enabled;
}

function updateSoundUI() {
  const btn = document.getElementById('btn-toggle-sound');
  const icon = document.getElementById('sound-icon');
  const text = document.getElementById('sound-text');
  if (!btn || !icon || !text) return;

  if (soundEnabled) {
    icon.textContent = '🔊';
    text.textContent = 'صوت مفعل';
    btn.style.background = 'rgba(255,255,255,0.1)';
    btn.style.color = 'white';
  } else {
    icon.textContent = '🔇';
    text.textContent = 'صوت معطل';
    btn.style.background = 'rgba(239,68,68,0.2)';
    btn.style.color = '#FCA5A5';
  }
}

// ============================================================
// TICKER BAS DE PAGE
// ============================================================
function buildTicker() {
  const content = document.getElementById('ticker-content');
  if (!content) return;
  const INFO_MESSAGES = [
    'مرحباً بكم في المستشفى الجامعي محمد السادس للأمراض العقلية والنفسية - طنجة',
    'المرجو احترام الهدوء داخل قاعات الانتظار حتى يُستدعى رقمكم',
    'استشارة في الطب النفسي — القاعات: 1، 3، 4، 5، 6',
    'حصة علاج نفسي فردية — القاعة: 2',
    'شكراً لتعاونكم'
  ];
  // Dupliquer pour l'animation infinie
  const doubled = [...INFO_MESSAGES, ...INFO_MESSAGES];
  content.innerHTML = doubled.map(m => `<span class="tv-ticker-item">◈ ${m}</span>`).join('');
}

// ============================================================
// START & AUDIO UNLOCK
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await dbReady;
  
  const overlay = document.getElementById('audio-unlock-overlay');
  
  if (overlay) {
    overlay.addEventListener('click', () => {
      // 1. Cacher l'overlay
      overlay.style.display = 'none';
      
      // 2. Initialiser l'UI du son
      updateSoundUI();
      
      // 3. Configurer le listener du bouton
      const btn = document.getElementById('btn-toggle-sound');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Éviter de déclencher d'autres événements
          toggleSound(!soundEnabled);
        });
      }

      // 4. Lancer l'application
      initAffichage();
    });
  } else {
    // Fallback au cas où l'overlay n'est pas là
    initAffichage();
  }
});
