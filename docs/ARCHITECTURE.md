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

Chaque dataset local comprend un manifeste `.json` et un ou plusieurs fichiers
`.grib2`. Le schéma courant est `schemaVersion: 3`. Le manifeste distingue le
`sourceId` logique des fichiers physiques et contient une liste de descripteurs de
frames avec échéance, date valide UTC et `sourceFileId`. `fileName` reste l'entrée de
compatibilité vers la première frame.

Les métadonnées 1.1 sans version et le schéma 2 sont migrés en lecture puis réécrits
comme une série mono-frame sans déplacer le GRIB. Une version future inconnue est refusée. Le scan distingue JSON corrompu,
fichier de données absent, GRIB orphelin et échec d'écriture de migration.

Règles :

- écrire d'abord dans un fichier temporaire ;
- télécharger et valider les neuf échéances H+0 à H+24 avant de publier le manifeste ;
- ne jamais supprimer une donnée valide lors d'un échec ;
- limiter les imports à 100 Mo ;
- renommer métadonnée et fichier de manière cohérente ;
- confirmer toute suppression.

## Pipeline GRIB actuel

1. Chercher le dernier run NOAA GFS disponible.
2. Télécharger la sous-zone et les messages ciblés.
3. Vérifier signature, édition, terminaison et sections.
4. Lire l'identité complète de chaque champ depuis les sections 0, 1 et 4.
5. Accepter uniquement le template produit 4.0, PRMSL au niveau moyen de la mer et
   U/V à exactement 10 m au-dessus du sol, en discipline météorologique.
6. Accepter la grille latitude/longitude régulière template 3.0, valider son échelle
   angulaire, `Di`, `Dj`, ses extrémités et le scanning mode 64.
7. Refuser les grilles traversant l'antiméridien, quasi régulières ou munies d'une
   liste optionnelle.
8. Accepter le packing simple, sans bitmap, et décoder les entiers signés GRIB en
   représentation signe-module.
9. Apparier U/V uniquement lorsqu'échéance, référence, niveau, processus et grille
   coïncident.
10. Utiliser exclusivement la section 3 pour le placement, l'inspection bilinéaire,
    les flèches et les isobares ; la bbox du catalogue reste descriptive.
11. Rejeter toute valeur non finie et toute structure dont les sections, longueurs,
    nombres de points ou données compactées sont incohérents.

Une frame évalue séparément la pression et le vent. U sans V ou V sans U rend
uniquement la couche vent indisponible ; PRMSL reste affichable. Une frame sans aucune
couche exploitable est rejetée. Le lecteur conserve la frame affichée pendant le
décodage de la suivante et ne remplace pression et vent qu'en une seule validation.
Le cache en mémoire est limité à la frame courante et ses deux voisines.

Ce périmètre est volontairement étroit. Un encodage non pris en charge est refusé
avant stockage au lieu d'être interprété approximativement. La checklist de
validation croisée se trouve dans [`GRIB_VALIDATION.md`](./GRIB_VALIDATION.md).

## Cartographie

### En ligne

OpenFreeMap est chargé par MapLibre sur iOS et Android. L'attribution reste visible.
L'overlay SVG reçoit les bornes Web Mercator visibles afin d'aligner projection,
inspection, pan et pincement.

Le point GPS natif MapLibre est affiché lorsque la permission foreground est accordée.
Pendant une interaction de caméra, l'overlay météo SVG est masqué puis réaffiché avec
les bornes finales afin d'éviter toute dérive visuelle entre deux moteurs de rendu.
La sélection native présente un fond neutre pendant le chargement d'OpenFreeMap et
n'affiche Natural Earth qu'après un échec réel du fond en ligne.

Sur la sélection, `ViewStateChangeEvent.bounds` devient directement la bbox GRIB,
arrondie au dixième de degré et limitée au domaine NOAA. Le fallback embarqué calcule
la même bbox depuis son viewport. `lib/downloadZone.ts` estime le nombre de points de
grille GFS 0,25° et bloque une vue dépassant 10 000 points ; les anciennes tailles
fixes 6/10/20° et les bulles d'aide ont été supprimées.

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
  version générale et `adaptive-foreground.png` comme premier plan Android à marge
  de sécurité renforcée.
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

Elle exécute lint, TypeScript et les tests Vitest. Les quarante-neuf tests actuels couvrent
l'état réseau, la transaction multi-échéances, les métadonnées, les frames et le parseur. La fixture NOAA valide trois
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
