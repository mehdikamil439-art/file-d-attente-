// ============================================================
// reception.js — Logique Page Réception
// ============================================================

let medecins = [];
let salles   = [];
let patientsAujourdhui = [];
let editingPatientId = null;

// Maps des affectations du jour (chargées au démarrage)
// medecinId  → { salle_id, salle_numero, type, salle_slug }
// salleId    → { medecin_id, medecin_nom, type }
let affParMedecin = {};  // { medecinId: {...} }
let affParSalle   = {};  // { salleId:   {...} }

// ============================================================
// INITIALISATION
// ============================================================
async function initReception() {
  await Promise.all([loadMedecins(), loadSalles()]);
  await loadAffectationsDuJour(); // ← Charger les maps AVANT setupForm
  await loadPatientsDuJour();
  setupForm();
  setupSearch();
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================
async function loadMedecins() {
  const { data, error } = await db.from('medecins').select('*').eq('actif', true).order('nom');
  if (error) { console.error(error); return; }
  medecins = data || [];
  populateMedecinSelect();
}

async function loadSalles() {
  const { data, error } = await db.from('salles').select('*').order('numero');
  if (error) { console.error(error); return; }
  salles = data || [];
}

async function loadPatientsDuJour() {
  const { data, error } = await db
    .from('patients')
    .select(`*, medecins(nom, prenom), salles(numero, slug, type_consultation)`)
    .eq('date_consultation', getAujourdhui())
    .order('numero_passage');

  if (error) { console.error(error); return; }
  patientsAujourdhui = data || [];
  renderPatientsTable(patientsAujourdhui);
  updateStats();
}

async function loadAffectationsDuJour() {
  const { data, error } = await db
    .from('medecin_salle')
    .select(`*, medecins(nom, prenom), salles(numero, slug, type_consultation)`)
    .eq('date_jour', getAujourdhui());
  if (error) return;

  // Construire les maps pour accès instantané
  affParMedecin = {};
  affParSalle   = {};
  (data || []).forEach(a => {
    if (a.salles && a.medecins) {
      affParMedecin[a.medecin_id] = {
        salle_id:     a.salle_id,
        salle_numero: a.salles.numero,
        salle_slug:   a.salles.slug,
        type:         a.salles.type_consultation
      };
      affParSalle[a.salle_id] = {
        medecin_id:  a.medecin_id,
        medecin_nom: `Dr. ${a.medecins.prenom} ${a.medecins.nom}`,
        type:        a.salles.type_consultation
      };
    }
  });

  renderAffectations(data || []);
}

// ============================================================
// FORMULAIRE — LOGIQUE AUTO-COMPLÉTION BIDIRECTIONNELLE
// ============================================================
function setupForm() {
  const typeSelect   = document.getElementById('type-consultation');
  const medecinSelect = document.getElementById('medecin-select');
  const salleSelect  = document.getElementById('salle-select');

  // Flag pour éviter les boucles d'événements
  let _updating = false;
  const safe = (fn) => { if (_updating) return; _updating = true; fn(); _updating = false; };

  // ── 1. Changer le TYPE ──────────────────────────────────────
  typeSelect.addEventListener('change', () => safe(() => {
    const type = typeSelect.value;
    updateTypeVisual(type);
    populateMedecinSelectFiltre(type);  // Médecins affectés à ce type en tête
    updateSalleOptions(type);           // Salles du bon type
    // Si médecin déjà sélectionné mais incompatible → réinitialiser
    const medId = parseInt(medecinSelect.value);
    if (medId && affParMedecin[medId] && affParMedecin[medId].type !== type) {
      medecinSelect.value = '';
      salleSelect.value = '';
    }
  }));

  // ── 2. Changer le MÉDECIN ───────────────────────────────────
  medecinSelect.addEventListener('change', () => safe(() => {
    const medId = parseInt(medecinSelect.value);
    if (!medId) return;
    const aff = affParMedecin[medId];
    if (aff) {
      // Affectation trouvée → remplir type et salle automatiquement
      typeSelect.value = aff.type;
      updateTypeVisual(aff.type);
      updateSalleOptions(aff.type);
      salleSelect.value = aff.salle_id;
    }
    // Si pas d'affectation, on laisse l'agent choisir type + salle manuellement
  }));

  // ── 3. Changer la SALLE ─────────────────────────────────────
  salleSelect.addEventListener('change', () => safe(() => {
    const salleId = parseInt(salleSelect.value);
    if (!salleId) return;
    const aff = affParSalle[salleId];
    const salle = salles.find(s => s.id === salleId);
    if (salle) {
      // Mettre à jour le type selon la salle
      typeSelect.value = salle.type_consultation;
      updateTypeVisual(salle.type_consultation);
      populateMedecinSelectFiltre(salle.type_consultation);
    }
    if (aff) {
      // Médecin affecté → sélectionner automatiquement
      medecinSelect.value = aff.medecin_id;
    }
  }));

  document.getElementById('form-patient').addEventListener('submit', soumettrePatient);
}

function updateTypeVisual(type) {
  const indicator = document.getElementById('type-indicator');
  if (!indicator || !type) return;
  const t = TYPES[type];
  indicator.textContent = t.label_ar;
  indicator.style.background   = t.couleur_light;
  indicator.style.color        = t.couleur;
  indicator.style.borderColor  = t.couleur_border;
  indicator.style.display      = 'block';
}

function updateSalleOptions(type) {
  const salleSelect = document.getElementById('salle-select');
  salleSelect.innerHTML = '<option value="">— Choisir une salle —</option>';
  if (!type) return;
  const allowed = TYPES[type].salles;
  salles.filter(s => allowed.includes(s.numero)).forEach(s => {
    const aff = affParSalle[s.id];
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `Salle ${s.numero}` + (aff ? ` — ${aff.medecin_nom}` : '');
    salleSelect.appendChild(opt);
  });
  // Si une seule salle pour ce type → auto-sélectionner
  if (allowed.length === 1) {
    const s = salles.find(s => s.numero === allowed[0]);
    if (s) salleSelect.value = s.id;
  }
}

// Popule le select médecin en mettant les médecins affectés (au bon type) EN TÊTE
function populateMedecinSelectFiltre(type) {
  const sel = document.getElementById('medecin-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choisir un médecin —</option>';

  // Séparer médecins affectés au bon type vs le reste
  const affectes    = [];
  const nonAffectes = [];

  medecins.forEach(m => {
    const aff = affParMedecin[m.id];
    if (aff && (!type || aff.type === type)) {
      affectes.push(m);
    } else {
      nonAffectes.push(m);
    }
  });

  if (affectes.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = '✅ Affectés aujourd\'hui';
    affectes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const aff = affParMedecin[m.id];
      opt.textContent = `Dr. ${m.prenom} ${m.nom}` + (aff ? ` — Salle ${aff.salle_numero}` : '');
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  if (nonAffectes.length > 0) {
    const grp2 = document.createElement('optgroup');
    grp2.label = '— Autres médecins';
    nonAffectes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `Dr. ${m.prenom} ${m.nom}`;
      grp2.appendChild(opt);
    });
    sel.appendChild(grp2);
  }
}

function populateMedecinSelect() {
  populateMedecinSelectFiltre(null); // Tous les médecins sans filtre
}

// ============================================================
// SOUMETTRE LE FORMULAIRE
// ============================================================
async function soumettrePatient(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Enregistrement...';

  const nom    = document.getElementById('nom').value.trim().toUpperCase();
  const prenom = document.getElementById('prenom').value.trim();
  const type   = document.getElementById('type-consultation').value;
  const medId  = parseInt(document.getElementById('medecin-select').value);
  const salId  = parseInt(document.getElementById('salle-select').value);

  if (!nom || !prenom || !type || !medId || !salId) {
    showToast('Veuillez remplir tous les champs.', 'error');
    btn.disabled = false;
    btn.innerHTML = '✅ Enregistrer le patient';
    return;
  }

  // Générer le prochain numéro
  const numero = await getNextNumero(type);
  const t = TYPES[type];

  if (editingPatientId) {
    // Mode modification
    const { error } = await db.from('patients').update({
      nom, prenom, medecin_id: medId, salle_id: salId
    }).eq('id', editingPatientId).eq('statut', 'en_attente');

    if (error) { showToast('Erreur lors de la modification.', 'error'); }
    else { showToast('Patient modifié avec succès.'); editingPatientId = null; }
  } else {
    // Nouvelle entrée
    const { data, error } = await db.from('patients').insert([{
      nom, prenom,
      type_consultation: type,
      medecin_id: medId,
      salle_id: salId,
      numero_passage: numero,
      prefixe: t.prefixe,
      couleur: t.couleur,
      date_consultation: getAujourdhui()
    }]).select(`*, medecins(nom, prenom), salles(numero)`).single();

    if (error) { showToast('Erreur lors de l\'enregistrement.', 'error'); console.error(error); }
    else {
      showToast(`Patient enregistré — N° ${t.prefixe}-${String(numero).padStart(2,'0')}`);
      afficherBadgeModal(data);
    }
  }

  await loadPatientsDuJour();
  resetForm();
  btn.disabled = false;
  btn.innerHTML = '✅ Enregistrer le patient';
}

async function getNextNumero(type) {
  const prefixe = TYPES[type].prefixe;
  const { data } = await db
    .from('patients')
    .select('numero_passage')
    .eq('type_consultation', type)
    .eq('date_consultation', getAujourdhui())
    .order('numero_passage', { ascending: false })
    .limit(1);
  return data && data.length > 0 ? data[0].numero_passage + 1 : 1;
}

function resetForm() {
  document.getElementById('form-patient').reset();
  document.getElementById('salle-select').innerHTML = '<option value="">— Choisir une salle —</option>';
  const ind = document.getElementById('type-indicator');
  if (ind) ind.style.display = 'none';
  editingPatientId = null;
  document.getElementById('btn-submit').innerHTML = '✅ Enregistrer le patient';
  document.getElementById('form-title').textContent = 'Nouveau patient';
}

// ============================================================
// BADGE MODAL
// ============================================================
function afficherBadgeModal(patient) {
  const type = patient.type_consultation;
  const t = TYPES[type];
  const numFormate = `${t.prefixe}-${String(patient.numero_passage).padStart(2, '0')}`;
  const numDisplay = String(patient.numero_passage).padStart(2, '0');
  const medNom = patient.medecins ? `Dr. ${patient.medecins.prenom} ${patient.medecins.nom}` : '';
  const salleNum = patient.salles ? patient.salles.numero : '';

  const waveColor = type === 'psychiatrie' ? '#2E7D32' : '#1565C0';

  document.getElementById('badge-container').innerHTML = `
    <div class="badge-clip"></div>
    <div class="badge-body">
      <div class="badge-top">
        <img src="assets/logoGST.png" alt="GST" class="badge-logo-img">
        <div class="badge-chu-title">GST</div>
      </div>
      <div class="badge-wave">
        <svg viewBox="0 0 240 30" preserveAspectRatio="none">
          <path d="M0,30 Q60,0 120,15 Q180,30 240,10 L240,30 Z" fill="white"/>
        </svg>
      </div>
      <div class="badge-number-zone">
        <div class="badge-number">${numDisplay}</div>
        <div class="badge-type-ar">${t.label_ar}</div>
        <div class="badge-type-fr">${t.label_fr}</div>
      </div>
      <div class="badge-footer">
        <div class="badge-footer-ar">المستشفى الجامعي محمد السادس للأمراض العقلية والنفسية - طنجة</div>
        <div class="badge-footer-fr">Hôpital Universitaire de Psychiatrie Mohammed VI  -Tanger-</div>
      </div>
    </div>
  `;

  const badge = document.querySelector('.patient-badge');
  if (badge) { badge.className = `patient-badge ${type}`; }

  openModal('modal-badge');
}

// ============================================================
// IMPRESSION DU BADGE
// ============================================================
function printBadge() {
  const badgeEl = document.getElementById('badge-container');
  if (!badgeEl) return;

  // ── Extraire les données depuis le DOM du badge ─────────────
  const badgeWrapper = document.querySelector('.patient-badge');
  const type   = badgeWrapper?.classList.contains('psychiatrie') ? 'psychiatrie' : 'psychotherapie';
  const numero = badgeEl.querySelector('.badge-number')?.textContent?.trim()  || '—';
  const typeAr = badgeEl.querySelector('.badge-type-ar')?.textContent?.trim() || '';
  const typeFr = badgeEl.querySelector('.badge-type-fr')?.textContent?.trim() || '';

  // ── Palette de couleurs ─────────────────────────────────────
  const isPsy    = type === 'psychiatrie';
  const couleur  = isPsy ? '#2E7D32' : '#1565C0';
  const gradient = isPsy
    ? 'linear-gradient(160deg,#1B5E20 0%,#2E7D32 50%,#43A047 100%)'
    : 'linear-gradient(160deg,#0D47A1 0%,#1565C0 50%,#1E88E5 100%)';
  const footerBg = isPsy
    ? 'linear-gradient(0deg,#1B5E20,#2E7D32)'
    : 'linear-gradient(0deg,#0D47A1,#1565C0)';

  // ── URL absolue du logo ─────────────────────────────────────
  const logoUrl = window.location.origin + '/assets/logoGST.png';

  // ── Ouvrir et écrire la fenêtre d'impression ────────────────
  // Tailles calculées pour CR80 (54mm × 86mm) à 96dpi CSS (1mm = 3.78px)
  // Répartition des zones :
  //   Clip   :  4mm = 15px
  //   Header : 28mm = 106px  (logo 15mm, titre 5mm, padding 8mm)
  //   Vague  :  8mm = 30px
  //   Corps  : 33mm = 125px  (flexible)
  //   Footer : 13mm = 49px
  //   Total  : 86mm ✓
  const pw = window.open('', '_blank', 'width=600,height=800');
  pw.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Badge Patient</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
@page{size:54mm 86mm;margin:0}
body{width:54mm;font-family:'Cairo',Arial,sans-serif;background:white}
.card-page{
  width:54mm;height:86mm;overflow:hidden;
  page-break-after:always;
  print-color-adjust:exact;-webkit-print-color-adjust:exact
}
.card-page:last-child{page-break-after:auto}

/* ══ RECTO ══════════════════════════════════════════════════ */
.recto{display:flex;flex-direction:column;background:${gradient}}


/* En-tête verte — ~30mm */
.r-top{
  display:flex;flex-direction:column;align-items:center;
  padding:16px 8px 8px;flex-shrink:0
}
/* Logo — 10mm ≈ 38px */
.r-logo{
  width:38px;height:38px;
  object-fit:contain;
  filter:brightness(0) invert(1);
  margin-bottom:4px
}
/* "GST" — 4.5mm ≈ 17px */
.r-title{font-size:17px;font-weight:900;color:rgba(255,255,255,.95);letter-spacing:3px}

/* Vague — 7mm ≈ 26px */
.r-wave{width:100%;line-height:0;flex-shrink:0}
.r-wave svg{width:100%;height:26px;display:block}

/* Corps blanc — flexible */
.r-body{
  background:white;flex:1;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  padding:4px 8px 4px
}
/* Numéro — 16mm ≈ 62px */
.r-num{font-size:62px;font-weight:900;line-height:1;color:${couleur};margin-bottom:4px}
/* Type arabe — 3mm ≈ 11px */
.r-type-ar{font-size:11px;font-weight:700;color:${couleur};text-align:center;direction:rtl;line-height:1.35}
/* Type français — 2.5mm ≈ 9px */
.r-type-fr{font-size:9px;font-weight:600;color:${couleur};text-align:center;margin-top:2px}

/* Footer — ~16mm */
.r-footer{
  background:${footerBg};
  padding:5px 8px 6px;
  display:flex;flex-direction:column;
  align-items:center;gap:2px;flex-shrink:0
}
/* Footer arabe — 6.5px */
.r-footer-ar{font-size:6.5px;color:rgba(255,255,255,.95);direction:rtl;text-align:center;line-height:1.35;font-weight:600}
/* Footer français — 6px */
.r-footer-fr{font-size:6px;color:rgba(255,255,255,.8);text-align:center}

/* ══ VERSO ══════════════════════════════════════════════════ */
.verso{
  background:${gradient};
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px
}
.v-logo{width:19mm;filter:brightness(0) invert(1)}
.v-title{font-size:20px;font-weight:900;color:white;letter-spacing:6px}
.v-sub{
  font-size:7px;color:rgba(255,255,255,.8);
  text-align:center;padding:0 10px;
  direction:rtl;line-height:1.6
}
</style>
</head>
<body>

<!-- ══ PAGE 1 : RECTO ═════════════════════════════════════════ -->
<div class="card-page recto">
  <div class="r-top">
    <img src="${logoUrl}" class="r-logo" alt="GST">
    <div class="r-title">GST</div>
  </div>
  <div class="r-wave">
    <svg viewBox="0 0 240 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,30 Q60,0 120,15 Q180,30 240,10 L240,30 Z" fill="white"/>
    </svg>
  </div>
  <div class="r-body">
    <div class="r-num">${numero}</div>
    <div class="r-type-ar">${typeAr}</div>
    <div class="r-type-fr">${typeFr}</div>
  </div>
  <div class="r-footer">
    <div class="r-footer-ar">المستشفى الجامعي محمد السادس للأمراض العقلية والنفسية - طنجة</div>
    <div class="r-footer-fr">Hôpital Universitaire de Psychiatrie Mohammed VI -Tanger-</div>
  </div>
</div>

<!-- ══ PAGE 2 : VERSO ════════════════════════════════════════ -->
<div class="card-page verso">
  <img src="${logoUrl}" class="v-logo" alt="GST">
  <div class="v-title">GST</div>
  <div class="v-sub">المجموعة الصحية الترابية<br>Groupe de Santé Territorial</div>
</div>

<script>
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){
      setTimeout(function(){ window.print(); window.close(); }, 600);
    });
  } else {
    setTimeout(function(){ window.print(); window.close(); }, 1500);
  }
<\/script>
</body>
</html>`);
  pw.document.close();
}


// ============================================================
// TABLEAU DES PATIENTS
// ============================================================
function renderPatientsTable(patients) {
  const tbody = document.getElementById('patients-tbody');
  const filtre = document.getElementById('filtre-statut')?.value || '';
  const search = document.getElementById('search-patient')?.value?.toLowerCase() || '';

  let filtered = patients;
  if (filtre) filtered = filtered.filter(p => p.statut === filtre);
  if (search) filtered = filtered.filter(p =>
    p.nom.toLowerCase().includes(search) ||
    p.prenom.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏥</div><p>Aucun patient enregistré aujourd'hui</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const t = TYPES[p.type_consultation];
    const num = `${p.prefixe}-${String(p.numero_passage).padStart(2,'0')}`;
    const medNom = p.medecins ? `Dr. ${p.medecins.prenom} ${p.medecins.nom}` : '—';
    const salleNum = p.salles ? `Salle ${p.salles.numero}` : '—';
    const st = STATUTS[p.statut];
    const canEdit   = p.statut === 'en_attente';
    const canCancel = p.statut === 'en_attente';
    const canPrint  = ['en_attente','appele'].includes(p.statut);

    return `<tr>
      <td>
        <span class="num-badge ${p.type_consultation}" style="width:auto;padding:6px 10px;font-size:13px;">
          ${num}
        </span>
      </td>
      <td><strong>${p.nom}</strong> ${p.prenom}</td>
      <td><span class="type-pill ${p.type_consultation}">${t.label_fr}</span></td>
      <td style="font-size:13px;">${medNom}</td>
      <td>${salleNum}</td>
      <td><span class="badge ${st.css}">${st.label_fr}</span></td>
      <td style="font-size:12px;color:var(--text-muted);">${formatHeure(p.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${canPrint  ? `<button class="btn btn-sm btn-outline" onclick="viewBadge(${p.id})" title="Afficher le badge">👁️</button>` : ''}
          ${canEdit   ? `<button class="btn btn-sm btn-outline" onclick="startEdit(${p.id})" title="Modifier">✏️</button>` : ''}
          ${canCancel ? `<button class="btn btn-sm btn-danger"  onclick="annulerPatient(${p.id})" title="Annuler">✕</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function setupSearch() {
  document.getElementById('search-patient')?.addEventListener('input', () => renderPatientsTable(patientsAujourdhui));
  document.getElementById('filtre-statut')?.addEventListener('change', () => renderPatientsTable(patientsAujourdhui));
}

// ============================================================
// ACTIONS SUR PATIENTS
// ============================================================
async function annulerPatient(id) {
  if (!confirm('Annuler ce patient ?')) return;
  const { error } = await db.from('patients').update({ statut: 'annule' }).eq('id', id).eq('statut', 'en_attente');
  if (error) { showToast('Erreur.', 'error'); return; }
  showToast('Patient annulé.');
  await loadPatientsDuJour();
}

function startEdit(id) {
  const p = patientsAujourdhui.find(x => x.id === id);
  if (!p) return;
  editingPatientId = id;
  document.getElementById('nom').value = p.nom;
  document.getElementById('prenom').value = p.prenom;
  document.getElementById('type-consultation').value = p.type_consultation;
  updateTypeVisual(p.type_consultation);
  updateSalleOptions(p.type_consultation);
  document.getElementById('salle-select').value = p.salle_id;
  document.getElementById('medecin-select').value = p.medecin_id;
  document.getElementById('form-title').textContent = '✏️ Modifier le patient';
  document.getElementById('btn-submit').innerHTML = '💾 Enregistrer les modifications';
  document.getElementById('form-patient').scrollIntoView({ behavior: 'smooth' });
}

async function viewBadge(id) {
  const p = patientsAujourdhui.find(x => x.id === id);
  if (p) afficherBadgeModal(p);
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
  const total   = patientsAujourdhui.filter(p => p.statut !== 'annule').length;
  const attente = patientsAujourdhui.filter(p => p.statut === 'en_attente').length;
  const termines = patientsAujourdhui.filter(p => p.statut === 'termine').length;
  const psy     = patientsAujourdhui.filter(p => p.type_consultation === 'psychiatrie' && p.statut !== 'annule').length;
  const psycho  = patientsAujourdhui.filter(p => p.type_consultation === 'psychotherapie' && p.statut !== 'annule').length;

  setText('stat-total',   total);
  setText('stat-attente', attente);
  setText('stat-termine', termines);
  setText('stat-psy',     psy);
  setText('stat-psycho',  psycho);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================
// AFFECTATIONS MÉDECIN ↔ SALLE (configuration matin)
// ============================================================
function renderAffectations(affectations) {
  const container = document.getElementById('affectations-grid');
  if (!container) return;
  container.innerHTML = salles.map(salle => {
    const aff = affectations.find(a => a.salle_id === salle.id);
    const t = TYPES[salle.type_consultation];
    return `
      <div class="card" style="overflow:hidden;">
        <div style="padding:12px 16px;display:flex;align-items:center;gap:10px;background:${t.couleur_light};border-bottom:1px solid ${t.couleur_border};">
          <span style="font-weight:800;font-size:18px;color:${t.couleur};">Salle ${salle.numero}</span>
          <span style="font-size:12px;color:${t.couleur};background:white;padding:2px 8px;border-radius:999px;border:1px solid ${t.couleur_border};">${t.label_fr}</span>
        </div>
        <div style="padding:14px 16px;">
          <select class="form-control" onchange="assignerMedecin(${salle.id}, this.value)" style="font-size:13px;">
            <option value="">— Non assigné —</option>
            ${medecins.map(m => `<option value="${m.id}" ${aff && aff.medecin_id === m.id ? 'selected' : ''}>Dr. ${m.prenom} ${m.nom}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }).join('');
}

async function assignerMedecin(salleId, medecinId) {
  if (!medecinId) {
    await db.from('medecin_salle').delete().eq('salle_id', salleId).eq('date_jour', getAujourdhui());
    showToast('Affectation supprimée.');
    return;
  }
  const { error } = await db.from('medecin_salle').upsert({
    salle_id: parseInt(salleId),
    medecin_id: parseInt(medecinId),
    date_jour: getAujourdhui()
  }, { onConflict: 'salle_id,date_jour' });
  if (error) { showToast('Erreur affectation.', 'error'); console.error(error); return; }
  showToast('Médecin affecté avec succès.');
  await loadAffectationsDuJour();
}

function openModal(id) {
  const m = document.getElementById(id);
  m.style.display = 'flex';
  requestAnimationFrame(() => m.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('active');
  setTimeout(() => { m.style.display = 'none'; }, 200);
  document.body.style.overflow = '';
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await dbReady;
  initReception();
});
