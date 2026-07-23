# Gribzy — architecture technique

Ce document décrit l'implémentation. Les choix produit et UX se trouvent dans
[`PRODUCT.md`](./PRODUCT.md). L'état synthétique et l'ordre de lecture se trouvent
dans [`APP_REFERENCE.md`](./APP_REFERENCE.md).
Les lots techniques ordonnés sont décrits dans
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Socle

- Expo SDK 54.
- React Native 0.81, React 19.1 et TypeScript strict.
- Expo Router avec export web statique.
- MapLibre React Native pour la carte vectorielle native.
- Expo Network pour l'état de connectivité observé par l'écran de téléchargement.
- Expo Localization pour suivre la locale du téléphone.
- Nouvelle API `expo-file-system`.
- Vitest pour les fonctions pures et le parseur.
- Node.js 20.19 minimum ; l'environnement validé utilise Node 20.20.2.

MapLibre nécessite un development build ou un APK : Expo Go ne contient pas le module
natif. Le web utilise les variantes génériques des composants.

## Structure

- `app/library.tsx` : accueil, import et bibliothèque locale.
- `app/select.tsx` : sélection de zone et téléchargement.
- `app/map.tsx` : décodage et lecteur cartographique.
- `app/settings.tsx` : informations et réglages disponibles.
- `components/app-tab-bar.tsx` : navigation primaire.
- `components/zone-picker-map.native.tsx` : sélection OpenFreeMap native.
- `components/embedded-zone-picker-map.tsx` : planisphère embarqué et fallback.
- `components/online-tile-layer.native.tsx` : carte OpenFreeMap du lecteur.
- `lib/gribDownloadCore.ts` : transaction pure, fallback entre runs, annulation et nettoyage.
- `lib/gribDownload.ts` : adaptateur Expo FileSystem et téléchargement NOAA natif.
- `lib/gribParser.ts` : validation, décodage et isolignes GRIB2.
- `lib/datasetMetadata.ts` : validation et migration pure des métadonnées.
- `lib/storage.ts` : catalogue, import, renommage et suppression.
- `lib/location.ts` : permission et recentrage GPS.
- `lib/networkState.ts` : interprétation testable de l'état réseau.
- `lib/i18n.tsx` : dictionnaires anglais/français, détection, contexte et préférence persistante.
- `lib/gribParser.test.ts` : fixture NOAA et tests parser.
- `assets/map/world-land.ts` : géométrie Natural Earth embarquée.
- `eas.json` : profils development APK, preview APK et production AAB.
- `site/` : landing page statique bilingue et recrutement des testeurs Android.
- `.github/workflows/pages.yml` : publication du dossier `site/` sur GitHub Pages.
- `.github/ISSUE_TEMPLATE/beta-tester.yml` : candidature publique sans collecte d'e-mail.

Le dépôt doit avoir `Settings → Pages → Source: GitHub Actions` activé une fois par
un administrateur. Le workflow n'essaie pas de contourner cette étape avec
`enablement: true`, car l'action exige alors un token d'administration distinct du
`GITHUB_TOKEN` automatique.

## Stockage

Chaque donnée locale comprend un fichier `.grib2` et un fichier `.json` adjacent.
Le schéma courant est `schemaVersion: 2`. La métadonnée contient l'identifiant, le nom
physique, la zone, le modèle, la résolution, les paramètres, les échéances, le run, la
date de téléchargement et la taille.

Les métadonnées 1.1 sans version sont migrées en lecture puis réécrites sans déplacer
le GRIB. Une version future inconnue est refusée. Le scan distingue JSON corrompu,
fichier de données absent, GRIB orphelin et échec d'écriture de migration.

Règles :

- écrire d'abord dans un fichier temporaire ;
- valider avant d'ajouter au catalogue ;
- ne jamais supprimer une donnée valide lors d'un échec ;
- limiter les imports à 100 Mo ;
- renommer métadonnée et fichier de manière cohérente ;
- confirmer toute suppression.

## Pipeline GRIB actuel

1. Chercher le dernier run NOAA GFS disponible.
2. Télécharger la sous-zone et les messages ciblés.
3. Vérifier signature, édition, terminaison et sections.
4. Accepter la grille latitude/longitude template 3.0.
5. Accepter le packing simple, sans bitmap, scanning mode 64.
6. Exiger la pression et accepter la paire cohérente U/V.
7. Normaliser les longitudes GFS 0–360° vers −180–180°.
8. Décoder les valeurs, calculer les isobares et rendre l'overlay.

Ce périmètre est volontairement étroit. Un encodage non pris en charge est refusé
avant stockage au lieu d'être interprété approximativement.

## Cartographie

### En ligne

OpenFreeMap est chargé par MapLibre sur iOS et Android. L'attribution reste visible.
L'overlay SVG reçoit les bornes Web Mercator visibles afin d'aligner projection,
inspection, pan et pincement.

Aucun appel direct à `tile.openstreetmap.org`, préchargement massif ou aspiration de
tuiles publiques n'est autorisé.

### Hors ligne et web

Natural Earth 1:110m est compilé dans l'application. Il garantit un fond mondial
géoréférencé sans réseau, mais ne fournit pas encore le détail local visé. Le choix
d'une solution détaillée hors ligne devra définir licence, taille maximale, zones,
expiration et contrôle utilisateur avant implémentation.

## Compatibilité et distribution

- Android : package `com.gribzy.app`, edge-to-edge, permissions GPS précises et approximatives.
- iOS : bundle `com.gribzy.app`, tablette autorisée.
- Version actuelle : 1.1.0, Android versionCode 2.
- Branding : `assets/images/gribzy-bear-source.png` comme source, `icon.png` comme
  version 1024 px à marge de sécurité.
- EAS `development` : client de développement APK.
- EAS `preview` : APK autonome.
- EAS `production` : AAB.

## Internationalisation

Les textes d'interface utilisent les clés centralisées de `lib/i18n.tsx`. L'anglais
est le fallback obligatoire. En mode `auto`, `useLocales()` sélectionne le français
uniquement lorsque la première langue du téléphone est `fr`; toutes les autres
langues utilisent l'anglais. La préférence `auto | en | fr` est enregistrée dans le
stockage documentaire privé et s'applique immédiatement sans redémarrage.

Les erreurs du cœur restent écrites en anglais afin de fournir une base technique
stable. Les écrans traduisent les messages connus avant affichage. Les noms de zones
créés automatiquement suivent la langue active au moment de leur création ; un nom
déjà enregistré ou modifié par l'utilisateur n'est jamais réécrit lors d'un changement
de langue.

## Qualité et validation

La commande de référence est :

```bash
npm run check
```

Elle exécute lint, TypeScript et les tests Vitest. Les dix-sept tests actuels couvrent
l'état réseau, la transaction, les métadonnées et le parseur. La fixture NOAA valide trois
messages, la grille, le packing, des valeurs plausibles, la paire de vent et les
isobares.

L'export web de sept routes a été validé. Les validations restant manuelles sont le
téléchargement complet, les gestes, l'alignement, la persistance, le mode avion, les
performances et le parcours iOS/Android.

## Règles de changement

- Consulter `PRODUCT.md` avant toute décision fonctionnelle.
- Mettre à jour ce document lorsqu'un choix de stack, format ou architecture change.
- Ne pas ajouter de contrôle UI avant que sa donnée et son effet soient fonctionnels.
- Préserver les données utilisateur et les modifications non liées.
- Valider proportionnellement au risque ; `npm run check` avant livraison.
