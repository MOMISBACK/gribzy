# Gribzy

**Website and Android tester recruitment:** <https://momisback.github.io/gribzy/>

Application Expo de météo outdoor multisport hors ligne, pensée pour la randonnée,
la voile, le parapente et l'aviation légère. Elle télécharge des données GFS au format
GRIB2 pour une zone choisie sur une carte embarquée, puis affiche pression et vent
sans connexion.

Le cahier des charges et les décisions durables du projet se trouvent dans
[`docs/APP_REFERENCE.md`](docs/APP_REFERENCE.md). Ce document est la source de vérité
à consulter avant toute évolution.

## Développement

Prérequis : Node.js 20.19 ou supérieur et npm.

```bash
npm install
npm run check
npm start
```

Commandes utiles :

- `npm run ios` : simulateur iOS ;
- `npm run android` : émulateur Android ;
- `npm run web` : navigateur, pour vérification visuelle seulement ;
- `npm run check` : lint et vérification TypeScript.

## Fonctionnement hors ligne

La carte de sélection est incluse dans l'application. Chaque téléchargement GRIB
validé est conservé dans la bibliothèque locale avec ses métadonnées. Une connexion
est uniquement nécessaire pour ajouter ou actualiser une zone.
