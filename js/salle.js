// ============================================================
// salle.js — Logique Page Médecin (partagée par toutes les salles)
// Usage: définir SALLE_NUMERO (ex: 1) AVANT de charger ce script
// ============================================================

let salleInfo      = null;
let medecinDuJour  = null;
let fileAttente    = [];
let patientActuel  = null;
let salleChannel   = null;

// ============================================================
// INITIALISATION
// ============================================================
async function initSalle() {
  // SALLE_NUMERO est défini dans chaque page HTML
  if (typeof SALLE_NUMERO === 'undefined') { alert('Configuration salle manquante'); return; }

  await loadSalleInfo();
  await loadMedecinDuJour();
  await loadFileDAttente();
  await loadHistorique();
  setupRealtime();
  updateUI();
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================
async function loadSalleInfo() {
  const { data, error } = await db.from('salles').select('*').eq('numero', SALLE_NUMERO).single();
  if (error || !data) { console.error('Salle introuvable:', error); return; }
  salleInfo = data;

  // Appliquer le type visuellement
  const hero = document.getElementById('salle-hero');
  if (hero) {
    hero.classList.add(data.type_consultation);
    const t = TYPES[data.type_consultation];
    document.getElementById('salle-type-label').textContent = t.label_ar;
    document.getElementById('salle-num-display').textContent = `Salle ${SALLE_NUMERO}`;
    document.title = `Salle ${SALLE_NUMERO} — File d'Attente CHU`;
  }
}

async function loadMedecinDuJour() {
  if (!salleInfo) return;

  const { data, error } = await db
    .from('medecin_salle')
    .select(`*, medecins(id, nom, prenom)`)
    .eq('salle_id', salleInfo.id)
    .eq('date_jour', getAujourdhui())
    .maybeSingle();

  if (error) { console.error(error); return; }

  medecinDuJour = data?.medecins || null;
  const box = document.getElementById('doctor-box');
  if (!box) return;

  if (medecinDuJour) {
    document.getElementById('doctor-name').textContent = `Dr. ${medecinDuJour.prenom} ${medecinDuJour.nom}`;
    document.getElementById('doctor-sub').textContent = salleInfo.type_consultation === 'psychiatrie'
      ? 'Consultation Psychiatrique' : 'Psychothérapie Individuelle';
  } else {
    document.getElementById('doctor-name').textContent = 'Aucun médecin assigné';
    document.getElementById('doctor-sub').textContent = 'Configurez via la page Réception';
    document.getElementById('doctor-box').style.opacity = '.5';
  }
}

async function loadFileDAttente() {
  if (!salleInfo) return;

  const { data, error } = await db
    .from('patients')
    .select('*')
    .eq('salle_id', salleInfo.id)
    .eq('date_consultation', getAujourdhui())
    .eq('statut', 'en_attente')
    .order('numero_passage');

  if (error) { console.error(error); return; }
  fileAttente = data || [];

  // Chercher patient actuel (appelé ou en consultation)
  const { data: actuel } = await db
    .from('patients')
    .select('*')
    .eq('salle_id', salleInfo.id)
    .eq('date_consultation', getAujourdhui())
    .in('statut', ['appele', 'en_consultation'])
    .order('heure_appel', { ascending: false })
    .limit(1)
    .maybeSingle();

  patientActuel = actuel || null;
  renderFile();
  renderPatientActuel();
  updateCounters();
}

async function loadHistorique() {
  if (!salleInfo) return;

  const { data, error } = await db
    .from('patients')
    .select('*')
    .eq('salle_id', salleInfo.id)
    .eq('date_consultation', getAujourdhui())
    .in('statut', ['termine', 'annule'])
    .order('heure_fin', { ascending: false })
    .limit(20);

  if (error) return;
  renderHistorique(data || []);
}

// ============================================================
// RENDU INTERFACE
// ============================================================
function renderPatientActuel() {
  const card = document.getElementById('current-patient-card');
  const noPatient = document.getElementById('no-current-patient');
  const type = salleInfo?.type_consultation || 'psychiatrie';

  if (!patientActuel) {
    if (card) card.style.display = 'none';
    if (noPatient) noPatient.style.display = 'flex';
    updateActionButtons(false);
    return;
  }

  if (card) card.style.display = 'flex';
  if (noPatient) noPatient.style.display = 'none';
  card.className = `current-patient-card ${type}`;

  const num = `${patientActuel.prefixe}-${String(patientActuel.numero_passage).padStart(2,'0')}`;
  const numDisplay = String(patientActuel.numero_passage).padStart(2, '0');

  document.getElementById('current-num').textContent = numDisplay;
  document.getElementById('current-name').textContent = `${patientActuel.prenom} ${patientActuel.nom}`;
  document.getElementById('current-time').textContent =
    patientActuel.heure_appel ? `Appelé à ${formatHeure(patientActuel.heure_appel)}` : '';

  updateActionButtons(true, patientActuel.statut);
}

function renderFile() {
  const list = document.getElementById('queue-list');
  const count = document.getElementById('queue-count');
  if (count) count.textContent = fileAttente.length;

  if (!list) return;

  if (fileAttente.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:30px 20px;">
      <div class="empty-icon">✅</div>
      <p>File d'attente vide</p>
    </div>`;
    return;
  }

  const type = salleInfo?.type_consultation || 'psychiatrie';
  list.innerHTML = fileAttente.map((p, i) => {
    const numDisplay = String(p.numero_passage).padStart(2, '0');
    return `<div class="queue-item">
      <div class="queue-item-num ${type}">${numDisplay}</div>
      <div class="queue-item-info">
        <div class="queue-item-name">${p.prenom} ${p.nom}</div>
        <div class="queue-item-time">Enregistré à ${formatHeure(p.created_at)}</div>
      </div>
      <span class="queue-position">#${i + 1}</span>
    </div>`;
  }).join('');
}

function renderHistorique(history) {
  const list = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  if (count) count.textContent = history.filter(p => p.statut === 'termine').length;
  if (!list) return;

  if (history.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Aucun patient terminé</div>';
    return;
  }

  const type = salleInfo?.type_consultation || 'psychiatrie';
  list.innerHTML = history.map(p => {
    const numDisplay = String(p.numero_passage).padStart(2, '0');
    const st = STATUTS[p.statut];
    return `<div class="history-item">
      <div class="history-item-num ${type}">${numDisplay}</div>
      <div class="history-item-info">
        <div class="history-item-name">${p.prenom} ${p.nom}</div>
        <div class="history-item-time">${formatHeure(p.heure_fin || p.created_at)}</div>
      </div>
      <span class="badge ${st.css}" style="font-size:10px;">${st.label_fr}</span>
    </div>`;
  }).join('');
}

function updateCounters() {
  setText('counter-attente',  fileAttente.length);
  setText('counter-termine',  0); // sera mis à jour par loadHistorique
}

function updateActionButtons(hasPatient, statut = null) {
  const btnNext    = document.getElementById('btn-call-next');
  const btnDone    = document.getElementById('btn-call-done');
  const btnArrived = document.getElementById('btn-arrived');

  if (!btnNext) return;

  if (!hasPatient) {
    btnNext.disabled    = fileAttente.length === 0;
    if (btnDone)    btnDone.disabled = true;
    if (btnArrived) btnArrived.disabled = true;
    return;
  }

  btnNext.disabled = false;
  if (statut === 'appele') {
    if (btnArrived) btnArrived.disabled = false;
    if (btnDone)    btnDone.disabled = false;
  } else if (statut === 'en_consultation') {
    if (btnArrived) btnArrived.disabled = true;
    if (btnDone)    btnDone.disabled = false;
  }
}

function updateUI() {
  updateActionButtons(!!patientActuel, patientActuel?.statut);
}

// ============================================================
// ACTIONS MÉDECIN
// ============================================================
async function appellerSuivant() {
  if (fileAttente.length === 0) { showToast('Aucun patient en attente.', 'info'); return; }

  const btn = document.getElementById('btn-call-next');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const prochain = fileAttente[0];
  const { error } = await db.from('patients').update({
    statut: 'appele',
    heure_appel: new Date().toISOString()
  }).eq('id', prochain.id);

  if (error) { showToast('Erreur lors de l\'appel.', 'error'); console.error(error); }
  else { showToast(`Patient appelé — N° ${prochain.prefixe}-${String(prochain.numero_passage).padStart(2,'0')}`); }

  await refreshAll();
  btn.disabled = false;
  btn.innerHTML = '📢 Appeler le suivant';
}

async function patientArrive() {
  if (!patientActuel) return;
  const { error } = await db.from('patients').update({
    statut: 'en_consultation',
    heure_debut: new Date().toISOString()
  }).eq('id', patientActuel.id);

  if (!error) showToast('Consultation démarrée.');
  await refreshAll();
}

async function terminerConsultation() {
  if (!patientActuel) return;
  const { error } = await db.from('patients').update({
    statut: 'termine',
    heure_fin: new Date().toISOString()
  }).eq('id', patientActuel.id);

  if (!error) showToast('Consultation terminée ✅');
  await refreshAll();
}

async function refreshAll() {
  await loadFileDAttente();
  await loadHistorique();
}

// ============================================================
// REALTIME — Pour mise à jour si réception ajoute un patient
// ============================================================
function setupRealtime() {
  if (!salleInfo) return;
  salleChannel = db
    .channel(`salle-${SALLE_NUMERO}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'patients',
      filter: `salle_id=eq.${salleInfo.id}`
    }, async () => {
      await refreshAll();
    })
    .subscribe();
}

// ============================================================
// HELPERS
// ============================================================
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await dbReady;
  initSalle();
});
