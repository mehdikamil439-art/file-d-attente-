// ============================================================
// affichage.js — Écran d'Affichage Public TV (100% Arabe)
// Mise à jour en temps réel via Supabase Realtime
// ============================================================

let appelsActifs = {}; // { patient_id: {...data} }
let realtimeChannel = null;
let audioCtx = null;

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
            playBeep();
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
  const salleNum = p.salles ? p.salles.numero : '?';

  // Nom médecin en arabe (translittération simple ou depuis la DB)
  const medNom = p.medecins ? `${p.medecins.prenom} ${p.medecins.nom}` : '';

  return `
    <div class="call-card ${type}" id="card-${p.id}">
      <div class="call-number">${numDisplay}</div>
      <div class="call-divider"></div>
      <div class="call-type-ar">${t.label_ar}</div>
      <div class="call-doctor">
        <div class="call-doctor-label">الطبيب المعالج</div>
        <div class="call-doctor-name">د. ${medNom}</div>
      </div>
      <div class="call-room">
        <span class="call-room-icon">🚪</span>
        <div class="call-room-text">
          <span class="call-room-label">القاعة</span>
          <span class="call-room-num">${salleNum}</span>
        </div>
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

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .8);
    osc.start();
    osc.stop(audioCtx.currentTime + .8);
  } catch(e) { /* Son non disponible */ }
}

// ============================================================
// TICKER BAS DE PAGE
// ============================================================
function buildTicker() {
  const content = document.getElementById('ticker-content');
  if (!content) return;
  const messages = [
    'مرحباً بكم في مستشفى الجامعي للطب النفسي - طنجة',
    'يرجى الانتظار حتى يُستدعى رقمكم',
    'استشارة في الطب النفسي — القاعات: 1، 3، 4، 5، 6',
    'حصة علاج نفسي فردية — القاعة: 2',
    'شكراً لتعاونكم'
  ];
  // Dupliquer pour l'animation infinie
  const doubled = [...messages, ...messages];
  content.innerHTML = doubled.map(m => `<span class="tv-ticker-item">◈ ${m}</span>`).join('');
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await dbReady;
  initAffichage();
});
