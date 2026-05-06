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

  const printWindow = window.open('', '_blank', 'width=400,height=600');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Badge Patient</title>
      <link rel="stylesheet" href="css/main.css">
      <style>
        body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; }
        @media print {
          body { background: white; padding: 0; }
          @page { size: 85mm 140mm; margin: 5mm; }
        }
      </style>
    </head>
    <body>
      <div class="patient-badge">
        ${badgeEl.innerHTML}
      </div>
      <script>window.onload = () => { window.print(); window.close(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
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
