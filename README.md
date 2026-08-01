# Alerte Accident

Application web pour signaler et cartographier les accidents en temps réel.

## Prérequis

- **Node.js** ≥ 18 (télécharger sur https://nodejs.org)
- **PostgreSQL** ≥ 12 (télécharger sur https://www.postgresql.org/download/)

## Installation

### 1. Créer la base de données

Ouvrez un terminal PostgreSQL (psql) :

```sql
CREATE DATABASE bd_alerte;
```

Ou via pgAdmin : clic droit sur "Databases" > "Create" > "Database" > nom `bd_alerte`.

> Le schéma (table `accidents`) est créé automatiquement au premier démarrage du serveur.

### 2. Configurer la connexion

Le serveur utilise par défaut cette chaîne de connexion :

```
postgresql://postgres:210255@localhost:5432/bd_alerte
```

Pour la modifier, définissez la variable d'environnement `DATABASE_URL` avant de démarrer le serveur.

### 3. Installer les dépendances

Dans le dossier du projet :

```bash
npm install
```

### 4. Démarrer le serveur

```bash
npm start
```

Ouvrez ensuite votre navigateur sur **http://localhost:3000**

## Fonctionnalités

- Carte interactive (Leaflet + OpenStreetMap) avec regroupement des marqueurs
- Formulaire de signalement complet :
  - Nom / prénom / contact de l'informateur
  - Coordonnées GPS (bouton "Ma position" ou clic sur la carte)
  - Nom du lieu
  - Choix multiples d'engins (voiture, moto, camion, vélo, piéton, bus, autre)
  - Niveau de gravité (grave / moins grave)
  - Nombre de morts et de blessés
  - Description libre
  - Photo (avec compression automatique)
- Filtres latéraux (gravité + type d'engin)
- Notifications navigateur pour les nouvelles alertes
- Tableau de bord statistiques
- Interface bilingue Français / English

## Structure du projet

```
alerte-accident/
├── package.json
├── server.js            # Backend Express + PostgreSQL
├── public/
│   ├── index.html       # Interface
│   ├── styles.css       # Styles
│   └── app.js           # Logique front-end (carte, formulaire, notifs)
└── README.md
```

## Publication en ligne

Pour héberger l'application sur Internet, vous aurez besoin d'une base PostgreSQL accessible publiquement (Neon, Supabase, Railway, Aiven proposent des offres gratuites). Il suffit alors de définir la variable d'environnement `DATABASE_URL` avec la nouvelle chaîne de connexion.
