// ============================================================
// admin.js — Logique Page Administration
// ============================================================

let allPatients = [];
let allMedecins = [];
let allSalles   = [];

async function initAdmin() {
  await Promise.all([loadAllMedecins(), loadAllSalles()]);
  await loadAllPatients();
  renderStatsGlobales();
  renderAffecter();
  renderTableauComplet();
}

// ============================================================
// CHARGEMENT
// ============================================================
async function loadAllPatients() {
  const { data, error } = await db
    .from('patients')
    .select(`*, medecins(nom, prenom), salles(numero)`)
    .eq('date_consultation', getAujourdhui())
    .order('created_at', { ascending: false });
  if (error) return;
  allPatients = data || [];
}

async function loadAllMedecins() {
  const { data } = await db.from('medecins').select('*').order('nom');
  allMedecins = data || [];
}

async function loadAllSalles() {
  const { data } = await db.from('salles').select('*').order('numero');
  allSalles = data || [];
}

// ============================================================
// STATS GLOBALES
// ============================================================
function renderStatsGlobales() {
  const total     = allPatients.filter(p => p.statut !== 'annule').length;
  const attente   = allPatients.filter(p => p.statut === 'en_attente').length;
  const appeles   = allPatients.filter(p => ['appele','en_consultation'].includes(p.statut)).length;
  const termines  = allPatients.filter(p => p.statut === 'termine').length;
  const annules   = allPatients.filter(p => p.statut === 'annule').length;
  const psy       = allPatients.filter(p => p.type_consultation === 'psychiatrie' && p.statut !== 'annule').length;
  const psycho    = allPatients.filter(p => p.type_consultation === 'psychotherapie' && p.statut !== 'annule').length;

  setText('admin-total',    total);
  setText('admin-attente',  attente);
  setText('admin-appeles',  appeles);
  setText('admin-termines', termines);
  setText('admin-annules',  annules);
  setText('admin-psy',      psy);
  setText('admin-psycho',   psycho);

  // Taux de complétion
  const taux = total > 0 ? Math.round((termines / total) * 100) : 0;
  setText('admin-taux', `${taux}%`);
}

// ============================================================
// TABLEAU COMPLET
// ============================================================
function renderTableauComplet() {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  if (allPatients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>Aucun patient enregistré aujourd'hui</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = allPatients.map(p => {
    const t = TYPES[p.type_consultation];
    const num = `${p.prefixe}-${String(p.numero_passage).padStart(2,'0')}`;
    const medNom = p.medecins ? `Dr. ${p.medecins.prenom} ${p.medecins.nom}` : '—';
    const salleNum = p.salles ? `Salle ${p.salles.numero}` : '—';
    const st = STATUTS[p.statut];

    return `<tr>
      <td><span class="num-badge ${p.type_consultation}" style="width:auto;padding:6px 10px;font-size:13px;">${num}</span></td>
      <td><strong>${p.nom}</strong> ${p.prenom}</td>
      <td><span class="type-pill ${p.type_consultation}">${t.label_fr}</span></td>
      <td style="font-size:13px;">${medNom}</td>
      <td>${salleNum}</td>
      <td><span class="badge ${st.css}">${st.label_fr}</span></td>
      <td style="font-size:12px;color:var(--text-muted);">${formatHeure(p.created_at)}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// AFFECTATIONS MÉDECIN ↔ SALLE
// ============================================================
async function renderAffecter() {
  const { data: affectations } = await db
    .from('medecin_salle')
    .select(`*, medecins(nom, prenom), salles(numero, slug)`)
    .eq('date_jour', getAujourdhui());

  const container = document.getElementById('admin-affectations');
  if (!container) return;

  container.innerHTML = allSalles.map(salle => {
    const aff = (affectations || []).find(a => a.salle_id === salle.id);
    const t = TYPES[salle.type_consultation];
    return `
    <div class="card" style="overflow:hidden;">
      <div style="padding:12px 16px;background:${t.couleur_light};border-bottom:1px solid ${t.couleur_border};display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:800;font-size:18px;color:${t.couleur};">Salle ${salle.numero}</span>
          <span style="font-size:11px;color:${t.couleur};background:white;padding:2px 8px;border-radius:999px;">${t.label_fr}</span>
        </div>
        <a href="${salle.slug}.html" target="_blank" class="btn btn-sm btn-outline" style="font-size:11px;">🔗 Ouvrir</a>
      </div>
      <div style="padding:14px 16px;">
        <select class="form-control" onchange="adminAssigner(${salle.id}, this.value)" style="font-size:13px;">
          <option value="">— Non assigné —</option>
          ${allMedecins.map(m =>
            `<option value="${m.id}" ${aff && aff.medecin_id === m.id ? 'selected' : ''}>Dr. ${m.prenom} ${m.nom}</option>`
          ).join('')}
        </select>
        ${aff ? `<div style="margin-top:8px;font-size:12px;color:${t.couleur};font-weight:600;">✅ Dr. ${aff.medecins.prenom} ${aff.medecins.nom}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function adminAssigner(salleId, medecinId) {
  if (!medecinId) {
    await db.from('medecin_salle').delete().eq('salle_id', salleId).eq('date_jour', getAujourdhui());
    showToast('Affectation supprimée.');
  } else {
    const { error } = await db.from('medecin_salle').upsert({
      salle_id: parseInt(salleId),
      medecin_id: parseInt(medecinId),
      date_jour: getAujourdhui()
    }, { onConflict: 'salle_id,date_jour' });
    if (error) { showToast('Erreur.', 'error'); return; }
    showToast('Médecin affecté.');
  }
  await renderAffecter();
}

// ============================================================
// GESTION MÉDECINS
// ============================================================
async function renderListeMedecins() {
  const container = document.getElementById('medecins-list');
  if (!container) return;
  const { data } = await db.from('medecins').select('*').order('nom');
  container.innerHTML = (data || []).map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-weight:600;font-size:14px;">Dr. ${m.prenom} ${m.nom}</div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
        <input type="checkbox" ${m.actif ? 'checked' : ''} onchange="toggleMedecin(${m.id}, this.checked)" style="width:16px;height:16px;">
        ${m.actif ? '<span style="color:var(--success);">Actif</span>' : '<span style="color:var(--text-muted);">Inactif</span>'}
      </label>
    </div>
  `).join('');
}

async function toggleMedecin(id, actif) {
  await db.from('medecins').update({ actif }).eq('id', id);
  showToast(actif ? 'Médecin activé.' : 'Médecin désactivé.');
}

// ============================================================
// RÉINITIALISATION
// ============================================================
async function reinitialiserFile() {
  if (!confirm('Annuler TOUS les patients en attente d\'aujourd\'hui ?\n\nCette action est irréversible.')) return;
  const { error } = await db.from('patients')
    .update({ statut: 'annule' })
    .eq('date_consultation', getAujourdhui())
    .eq('statut', 'en_attente');
  if (error) { showToast('Erreur.', 'error'); return; }
  showToast('File réinitialisée.');
  await loadAllPatients();
  renderStatsGlobales();
  renderTableauComplet();
}

// ============================================================
// ONGLETS
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).style.display = 'block';
  if (tab === 'medecins') renderListeMedecins();
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
  initAdmin();
});
