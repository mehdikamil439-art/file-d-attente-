# 🏥 Système de File d'Attente — CHU Psychiatrique Tanger

> Hôpital Universitaire Psychiatrique — Tanger  
> مستشفى الجامعي للطب النفسي - طنجة

---

## 📁 Structure du projet

```
file-attente-hopital/
├── index.html          → Accueil / Navigation
├── reception.html      → Page Réception (agent)
├── affichage.html      → Écran TV public (arabe)
├── admin.html          → Administration
├── salle01.html        → Médecin Salle 1 (Psychiatrie)
├── salle02.html        → Médecin Salle 2 (Psychothérapie)
├── salle03.html        → Médecin Salle 3 (Psychiatrie)
├── salle04.html        → Médecin Salle 4 (Psychiatrie)
├── salle05.html        → Médecin Salle 5 (Psychiatrie)
├── salle06.html        → Médecin Salle 6 (Psychiatrie)
├── css/
│   ├── main.css        → Design system global
│   ├── badge.css       → Badge imprimable (@media print)
│   ├── affichage.css   → Écran TV
│   └── salle.css       → Page médecin
├── js/
│   ├── supabase-config.js  → ⚠️ Configuration Supabase
│   ├── reception.js
│   ├── affichage.js
│   ├── salle.js
│   └── admin.js
├── assets/
│   └── logo-chu.png    → Logo CHU
├── supabase-schema.sql → Schéma base de données
└── README.md
```

---

## 🚀 Installation & Déploiement

### Étape 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New Project**
2. Choisir un nom (ex: `chu-file-attente`), région Europe
3. Aller dans **SQL Editor** → coller le contenu de `supabase-schema.sql` → **Run**
4. Aller dans **Table Editor** → vérifier que les tables sont créées
5. Aller dans **Settings → API** → copier :
   - **URL** : `https://XXXX.supabase.co`
   - **anon public key** : `eyJhb...`

### Étape 2 — Configurer le projet

Ouvrir `js/supabase-config.js` et remplacer :

```javascript
const SUPABASE_URL = 'https://VOTRE_PROJET_ID.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON_PUBLIQUE';
```

### Étape 3 — Activer Realtime

Dans Supabase Dashboard :
1. Aller dans **Database → Replication**
2. Activer la table `patients` dans la section Realtime

### Étape 4 — Déployer sur GitHub Pages

```bash
# 1. Créer un repo GitHub
# 2. Pousser les fichiers
git init
git add .
git commit -m "Initial commit — File d'attente CHU"
git remote add origin https://github.com/VOTRE_USERNAME/file-attente-chu.git
git push -u origin main

# 3. Activer GitHub Pages
# Settings → Pages → Source: main branch → /root
# URL: https://VOTRE_USERNAME.github.io/file-attente-chu/
```

### Déploiement local (réseau interne)

Ouvrir simplement `index.html` dans le navigateur, ou utiliser VS Code Live Server.

Pour accès réseau local : utiliser l'IP du PC serveur à la place de `localhost`.

---

## 🖥️ Pages & URLs

| Page | URL | Usage |
|------|-----|-------|
| Accueil | `index.html` | Navigation générale |
| Réception | `reception.html` | Agent de réception |
| Écran TV | `affichage.html` | Écran d'affichage public |
| Administration | `admin.html` | Config + stats |
| Salle 1 | `salle01.html` | Médecin Salle 1 |
| Salle 2 | `salle02.html` | Médecin Salle 2 |
| Salle 3 | `salle03.html` | Médecin Salle 3 |
| Salle 4 | `salle04.html` | Médecin Salle 4 |
| Salle 5 | `salle05.html` | Médecin Salle 5 |
| Salle 6 | `salle06.html` | Médecin Salle 6 |

---

## 🏥 Flux d'utilisation quotidien

### Matin (Réception/Admin)
1. Ouvrir `reception.html`
2. Section **Affectation des salles** : assigner chaque médecin à sa salle du jour
3. Le médecin ouvre son lien de salle sur son PC/tablette

### Enregistrement patient (Réception)
1. Saisir **Nom, Prénom**
2. Sélectionner le **type de consultation**
3. Sélectionner le **médecin** → la salle se remplit automatiquement
4. Cliquer **"Enregistrer le patient"**
5. Le **badge apparaît** → cliquer **"Imprimer"** → badge CHU imprimé
6. Remettre le badge au patient (porte-badge plastique)

### En salle (Médecin)
1. Ouvrir son lien de salle (ex: `salle03.html`)
2. Voir la file d'attente en temps réel
3. Cliquer **"📢 Appeler le suivant"** → L'écran TV se met à jour instantanément
4. Patient entre → **"👤 Patient présent"**
5. Consultation terminée → **"✅ Consultation terminée"**

---

## 🎨 Codes couleurs

| Type | Couleur | Salles |
|------|---------|--------|
| Consultation Psychiatrique (استشارة في الطب النفسي) | 🟢 Vert `#2E7D32` | 1, 3, 4, 5, 6 |
| Psychothérapie Individuelle (حصة علاج نفسي فردية) | 🔵 Bleu `#1565C0` | 2 |

### Numérotation
- Psychiatrie : `P-01`, `P-02`...
- Psychothérapie : `T-01`, `T-02`...
- Remise à zéro chaque jour automatiquement

---

## 📋 Statuts patients

| Statut | Description |
|--------|-------------|
| `en_attente` | Patient enregistré, en salle d'attente |
| `appele` | Médecin a cliqué "Appeler" → affiché sur écran TV |
| `en_consultation` | Patient physiquement dans le bureau |
| `termine` | Consultation terminée |
| `annule` | Annulé par la réception |

---

## 🔒 Sécurité

- Aucune authentification (système ouvert par design)
- Clé Supabase `anon` publique — configurer RLS si besoin de restreindre
- Données patients du jour uniquement (pas d'historique multi-jours visible)

---

## 📞 Support

Système développé pour le CHU Psychiatrique Universitaire de Tanger.
