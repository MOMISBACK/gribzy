# Gribzy — plan d'implémentation

Ce plan traduit la roadmap de [`PRODUCT.md`](./PRODUCT.md) en lots exécutables. Il
décrit l'ordre, les dépendances et les preuves attendues. Il ne remplace ni la vision
produit ni les décisions d'architecture.

## Diagnostic au 22 juillet 2026

### Verdict

L'application est une **alpha fonctionnelle bien structurée**. Le flux nominal est
présent et la base UI est plus avancée que le moteur météo. Deux promesses centrales
restent toutefois incomplètes :

1. une « prévision » ne contient aujourd'hui que l'échéance initiale `f000` ;
2. le fond embarqué fonctionne hors ligne, mais n'a pas le détail local attendu.

Le prochain travail doit donc renforcer la preuve et la donnée, pas ajouter des écrans.

### Forces vérifiées

- navigation et parcours simples ;
- stockage privé, import, renommage et suppression ;
- téléchargement temporaire non destructif ;
- validation GRIB stricte avant stockage ;
- pression, vent et isobares issus d'une fixture NOAA réelle ;
- OpenFreeMap natif avec fallback embarqué ;
- code TypeScript strict et export web fonctionnel ;
- identité et profils de build configurés.

### Faiblesses et risques

| Risque | Impact | Constat |
| --- | --- | --- |
| Parcours non testé sur appareil | Critique | GPS, MapLibre, reprise, redémarrage et mode avion restent à prouver |
| Une seule échéance | Critique | Timeline et animation ne peuvent pas fonctionner réellement |
| Fond hors ligne trop grossier | Élevé | Natural Earth 1:110m situe une zone, pas un sentier ou une côte détaillée |
| Couverture automatisée faible | Élevé | 3 tests parser seulement ; téléchargement et stockage ne sont pas testés |
| Connectivité implicite | Élevé | Le bouton tente un téléchargement même hors ligne |
| Décodage dans l'écran Carte | Moyen | `app/map.tsx` concentre lecture, calcul, projection et UI |
| Métadonnées trop étroites | Moyen | Pas de schéma versionné, échéances, paramètres, résolution ou modèle générique |
| Performance non mesurée | Moyen | Budgets définis mais aucune mesure sur appareil |
| Compatibilité GRIB ciblée | Accepté | Template 3.0, packing simple, sans bitmap, scanning mode 64 uniquement |

## Règles d'exécution

- Un lot n'est terminé que lorsque ses critères d'acceptation sont vérifiés.
- Préserver la lecture des fichiers existants à chaque migration.
- Ajouter les tests avant ou avec le comportement critique.
- Ne jamais activer une commande UI sans donnée réelle.
- Ne pas commencer un nouveau modèle avant d'avoir stabilisé GFS multi-échéances.
- Toute carte hors ligne doit avoir licence, quota, taille et contrôle utilisateur définis.
- `npm run check` doit passer après chaque lot de code.

## État d'exécution

| Tâche | État | Preuve restante |
| --- | --- | --- |
| NET-101 — état de connectivité | Implémenté, validation appareil requise | Mode avion puis retour en ligne sur APK Android |
| DL-102 — téléchargement testable | Cœur implémenté, validation native requise | Timeout natif et essai interruption sur appareil |
| STORE-103 — catalogue versionné | Implémenté, validation native requise | Ouvrir un catalogue 1.1 réel puis vérifier sa réécriture |
| CORE-104 — service de décodage | À faire | Fixture décodée hors écran |
| MAP-105 — alignement | À faire | Tests de projection et contrôle appareil |
| QA-106 — parcours automatisé | À faire | Outil E2E choisi et scénario critique exécuté |

## Ordre global

```text
Lot 0 — preuve actuelle
  ↓
Lot 1 — fiabilité V1
  ↓
Lot 2 — modèle de données temporel
  ↓
Lot 3 — vraie timeline GFS
  ↓
Lot 4 — météo multisport minimale
  ↓
Lot 5 — carte détaillée hors ligne
  ↓
Lot 6 — analyse locale et nouveaux modèles
```

Le lot 5 possède une étude technique dès le lot 1 afin d'éviter de choisir trop tard
une solution incompatible avec les licences ou le stockage mobile.

## Lot 0 — établir la référence sur appareil

Objectif : distinguer les défauts réels des hypothèses avant de modifier le moteur.

### Tâches

- **QA-001** — installer l'APK preview sur un Android physique.
- **QA-002** — enregistrer le résultat de : lancement, bibliothèque vide, sélection,
  pan, pincement, GPS, téléchargement, ouverture et inspection.
- **QA-003** — fermer complètement l'application, la relancer, puis ouvrir le même GRIB.
- **QA-004** — activer le mode avion et répéter bibliothèque, ouverture, pan et inspection.
- **QA-005** — vérifier l'alignement visuel sur au moins trois zones : côtière,
  continentale et proche de ±180°.
- **QA-006** — vérifier le launcher, le splash et les masques d'icône.

### Livrable

Une checklist datée avec appareil, version Android, APK et résultat de chaque étape.

### Critère de sortie

Aucun blocage critique inconnu dans le parcours nominal ; chaque défaut observé possède
une reproduction et une priorité.

## Lot 1 — fiabiliser la V1

Objectif : rendre le parcours minimal explicite, testable et robuste.

### NET-101 — état de connectivité

**État : implémenté le 22 juillet 2026, acceptation sur appareil en attente.**

- intégrer une API réseau compatible Expo 54 ;
- afficher « Connexion requise » sur l'écran de téléchargement hors ligne ;
- désactiver uniquement l'action réseau ;
- conserver sélection, bibliothèque et lecteur utilisables ;
- distinguer absence de réseau, erreur NOAA et fichier invalide.

**Acceptation :** en mode avion, aucune tentative ne démarre et le message indique
l'action possible ; le retour en ligne réactive le téléchargement.

### DL-102 — rendre le téléchargement testable

**État : cœur transactionnel implémenté le 22 juillet 2026.** Le transport Expo reste
à valider sur appareil et le bornage temporel ne sera ajouté qu'avec une annulation
native qui ne peut pas laisser une écriture orpheline.

- isoler la résolution des runs et le transport HTTP derrière des fonctions injectables ;
- tester le fallback entre runs, le nettoyage temporaire et la conservation des données ;
- borner temps d'attente et messages d'erreur ;
- ne jamais charger inutilement un gros fichier plusieurs fois en mémoire.

**Fichiers principaux :** `lib/gribDownload.ts`, nouveaux tests dédiés.

**Acceptation :** tests couvrant succès, run indisponible, réponse invalide, interruption
et échec de tous les candidats.

### STORE-103 — versionner le catalogue

**État : implémenté le 22 juillet 2026, migration sur appareil en attente.** Le schéma
2 conserve les fichiers 1.1, prépare les échéances futures et expose les anomalies du
catalogue sans empêcher les autres données de s'ouvrir.

- ajouter un `schemaVersion` ;
- prévoir modèle, résolution, paramètres et échéances ;
- migrer en lecture les métadonnées actuelles sans perdre de fichier ;
- détecter et signaler les métadonnées orphelines ou corrompues.

**Acceptation :** un catalogue créé en 1.1 reste lisible après migration et un élément
corrompu n'empêche pas de charger les autres.

### CORE-104 — sortir le décodage de l'écran

- créer un service qui transforme un fichier local en dataset rendu ;
- laisser `app/map.tsx` orchestrer l'UI uniquement ;
- tester pression, vent, bbox, inspection et erreurs sans rendre un écran.

**Acceptation :** le même fixture produit les mêmes valeurs et l'écran Carte ne lit plus
directement les sections GRIB.

### MAP-105 — verrouiller l'alignement

- tester les conversions longitude/latitude ↔ écran ;
- couvrir Web Mercator, bornes, latitude élevée et antéméridien ;
- supprimer tout calcul dupliqué entre toucher et rendu.

**Acceptation :** aller-retour géographique dans une tolérance documentée et inspection
cohérente après pan/pincement.

### QA-106 — automatiser le parcours critique

- ajouter des tests de composants pour bibliothèque, état hors ligne et erreurs ;
- choisir un outil E2E Android compatible avec le build natif ;
- automatiser au minimum ouverture locale et navigation des trois onglets.

**Sortie du lot 1 :** nouvelle exécution complète du lot 0 sur Android, puis iOS.

## Décision anticipée — carte hors ligne

Cette étude commence pendant le lot 1, sans implémentation prématurée.

### OFF-150 — étude de solution

Comparer au minimum :

- paquet vectoriel régional téléchargé explicitement ;
- MBTiles/PMTiles ou format équivalent supporté par le moteur choisi ;
- fond embarqué enrichi à plusieurs niveaux ;
- association d'un paquet de carte à la bbox du GRIB.

Pour chaque option, documenter licence, attribution, taille par zone, zoom maximal,
suppression, expiration, mise à jour, fonctionnement MapLibre et coût de maintenance.

**Décision attendue :** une architecture validée avant le lot 5. Les serveurs publics
OpenStreetMap ne sont jamais une source de téléchargement massif.

## Lot 2 — introduire le temps dans les données

Objectif : préparer plusieurs échéances sans casser les fichiers V1.

### DATA-201 — modèle de dataset V2

Structure recommandée :

- un manifeste versionné par dataset ;
- modèle, run, résolution et bbox ;
- liste ordonnée d'échéances ;
- paramètres réellement présents par échéance ;
- un ou plusieurs fichiers locaux vérifiés ;
- état complet/incomplet et taille totale.

La décision fichier concaténé versus fichiers par échéance doit être prise après un
prototype de téléchargement et de lecture. Privilégier la reprise, le nettoyage et
une faible consommation mémoire.

### PARSER-202 — temps de prévision

- lire template produit, unité et valeur d'échéance ;
- calculer date du run et date valide ;
- grouper pression/U/V par grille et échéance ;
- refuser les paires incohérentes ;
- ajouter des fixtures `f003`, `f006` et au moins un fichier incompatible.

### STORE-203 — migration compatible

- lire les datasets V1 comme une série contenant `H+0` ;
- écrire les nouveaux téléchargements au format V2 ;
- supprimer atomiquement manifeste et échéances ;
- calculer la taille totale.

**Sortie du lot 2 :** bibliothèque et lecteur ouvrent indifféremment un ancien fichier
et une série multi-échéances, même si la timeline n'anime pas encore.

## Lot 3 — livrer la vraie timeline GFS

Objectif : permettre de comprendre l'évolution météo.

### DL-301 — téléchargement multi-échéances

- proposer d'abord 24 h et 48 h avec un pas raisonnable ;
- télécharger séquentiellement ou avec concurrence bornée ;
- afficher échéance courante et progression globale ;
- conserver le dataset précédent si la nouvelle série échoue ;
- permettre l'annulation et nettoyer les fragments.

### MAP-302 — cache de frames décodées

- décoder la frame courante et précharger uniquement les voisines ;
- borner la mémoire ;
- annuler un décodage devenu inutile ;
- mesurer temps de changement et FPS.

### UI-303 — timeline active

- précédent, suivant, slider et lecture ;
- vitesse et boucle dans l'état étendu ;
- date valide et heure UTC sans ambiguïté ;
- désactiver proprement l'animation sur un dataset mono-échéance ;
- respecter la réduction des animations du système.

**Acceptation :** lecture fluide d'une série 24 h, changement exact de valeurs et
redémarrage hors ligne sans requête réseau.

## Lot 4 — météo multisport minimale

Objectif : compléter pression et vent avec les variables les plus utiles.

### WX-401 — température

- ajouter requête NOAA, identification GRIB, unité et validation ;
- afficher overlay, légende et valeur ponctuelle ;
- tests de valeurs plausibles et absence du paramètre.

### WX-402 — pluie

- définir précisément accumulation et période ;
- éviter de présenter une accumulation comme une intensité ;
- afficher unité et intervalle dans la légende et le point météo.

### UI-403 — légende et transparence

- bottom sheet unique pour visibilité, transparence, légende et unités ;
- application immédiate ;
- palettes scientifiques lisibles et testées pour déficiences colorées.

**Acceptation :** chaque valeur affiche paramètre, unité, échéance et provenance sans
ambiguïté.

## Lot 5 — carte détaillée hors ligne

Objectif : fournir un contexte local réellement utile sous le GRIB.

### OFF-501 — gestion des paquets

- télécharger uniquement une zone choisie par l'utilisateur ;
- annoncer la taille avant confirmation ;
- progression, annulation, vérification et suppression ;
- quota configurable et nettoyage explicite ;
- attribution disponible hors ligne.

### OFF-502 — rendu et fallback

- utiliser le paquet local sous l'overlay lorsqu'il couvre la vue ;
- OpenFreeMap en ligne lorsque permis ;
- Natural Earth en dernier fallback ;
- ne jamais afficher une zone blanche silencieuse.

**Acceptation :** une zone test offre le niveau de détail défini en mode avion, après
redémarrage, sans aucune requête réseau.

## Lot 6 — analyse locale et extension

Objectif : approfondir uniquement après stabilisation des séries temporelles.

- **AN-601** — météogramme à partir des séries réelles.
- **AN-602** — table temporelle avec jours fixes et cartes lisibles.
- **WX-603** — humidité, nuages et vagues selon disponibilité et validation.
- **MODEL-604** — ajouter un modèle à la fois avec téléchargement, licence, décodage,
  tests et présentation complets.
- **SHARE-605** — partage de fichier ou fiche sans exposer de donnée privée.
- **INT-606** — widgets/raccourcis uniquement s'ils restent utiles hors ligne.

## Backlog explicitement différé

- routage ;
- réseau social et comptes ;
- synchronisation cloud obligatoire ;
- catalogue de dizaines de couches ;
- 3D et fonctions SIG ;
- animation de particules avant validation des performances ;
- monétisation intrusive.

## Matrice de validation continue

| Après chaque lot | Preuve requise |
| --- | --- |
| Code | lint, TypeScript, tests |
| Stockage | migration, interruption, redémarrage |
| Réseau | hors ligne, lent, erreur serveur, reprise |
| Carte | alignement, pan, pincement, antéméridien |
| Météo | fixture réelle, unité, échéance, plausibilité |
| UI | soleil/contraste, cibles 48 dp, une main |
| Performance | démarrage, décodage, FPS, mémoire |
| Distribution | APK Android ; iOS aux jalons V1/V2 |
