# Gribzy — référence produit

Statut du document : source de vérité produit. Toute fonctionnalité, décision UX ou
priorité doit renforcer la promesse centrale ou être explicitement rejetée.

> **La météo hors ligne pour celles et ceux qui vont dehors.**

## Pourquoi Gribzy

Les applications météo modernes deviennent de plus en plus riches, mais supposent
souvent une connexion permanente et multiplient les informations secondaires. Les
lecteurs GRIB historiques sont puissants, mais leur prise en main et leur interface
sont rarement adaptées à un téléphone utilisé dehors.

Gribzy combine la simplicité d'une application mobile moderne avec la fiabilité d'un
lecteur GRIB local. L'utilisateur prépare sa zone avant de perdre le réseau, puis garde
une information météo lisible, rapide et vérifiable sur le terrain.

Chaque évolution doit répondre à une question : **rend-elle la consultation météo
outdoor plus rapide, plus claire ou plus fiable ?** Sinon, elle n'appartient
probablement pas au produit minimal.

## Vision

Gribzy est un compagnon météo outdoor minimal, offline-first et sans compte. Il
s'adresse à toute activité dépendant du vent, de la pression et de la disponibilité
du réseau.

Gribzy complète la préparation et le jugement de l'utilisateur. Il ne remplace jamais
les alertes, bulletins, briefings, NOTAM ou prévisions officielles applicables à
l'activité pratiquée.

## Promesse

Avant de partir, l'utilisateur peut choisir une zone, télécharger une prévision et
vérifier exactement ce qui sera disponible. Une fois hors ligne, il retrouve ses
fichiers, le fond de carte prévu et les données météo sans compte ni cloud.

Les qualités recherchées, dans l'ordre, sont :

1. Fiable.
2. Lisible dehors.
3. Utile hors ligne.
4. Rapide.
5. Simple.
6. Extensible sans encombrement.

## Principes non négociables

- **Offline-first** : une donnée annoncée disponible hors ligne l'est réellement.
- **Conservation** : un échec de téléchargement ne détruit jamais un fichier valide.
- **Validation** : un fichier incompatible n'entre pas silencieusement dans la bibliothèque.
- **Transparence** : modèle, run, âge, taille et zone restent identifiables.
- **Carte prioritaire** : la météo et son contexte géographique passent avant l'interface.
- **Minimalisme honnête** : aucun contrôle ne simule une capacité absente.
- **Sécurité** : aucune formulation ne présente Gribzy comme une source certifiée suffisante.
- **Vie privée** : aucun compte, profilage ou suivi comportemental.

## Principes UX

- Une seule action principale évidente par écran.
- Trois destinations maximum et exactement trois onglets : Fichiers, Carte, Réglages.
- Les actions secondaires restent discrètes et accessibles en un ou deux gestes.
- La météo passe avant le chrome ; sur le lecteur, les surfaces flottantes restent compactes.
- Les cibles tactiles mesurent au moins 48 dp et restent utilisables à une main.
- Le contraste doit fonctionner au soleil et sur un support en mouvement.
- Préférer les gestes directs et les bottom sheets Material aux écrans intermédiaires.
- Éviter les dialogues visuels anciens ; les confirmations destructives peuvent utiliser
  une alerte système accessible.
- Les changements d'affichage s'appliquent immédiatement, sans bouton « OK ».
- Aucun texte essentiel ne doit être minuscule.
- Les animations expliquent un changement d'état ; elles ne décorent pas.

## Navigation et écrans

### Fichiers

L'accueil est introduit par une bannière horizontale fine utilisant le symbole Gribzy,
sans détourner l'attention des actions. « Ouvrir un fichier GRIB » reste l'action
principale. Le téléchargement d'une zone est secondaire. La liste récente montre un
nom lisible, le modèle, le run, la taille et la date, avec ouverture, renommage et
suppression confirmée.

### Téléchargement

Le parcours reste progressif : zone, modèle, résolution, durée, paramètres, puis
téléchargement. Une étape n'apparaît que lorsqu'elle fonctionne réellement. Dans le
MVP actuel, seul GFS avec une résolution et des paramètres fixes est disponible.

La zone téléchargée correspond aux limites visibles de la carte : déplacer et pincer
la carte modifie directement la bbox, sans sélecteur de taille parallèle. Lorsque la
vue est trop large pour une requête GFS fiable, l'action demande de zoomer plutôt que
de lancer silencieusement un téléchargement excessif.

La sélection n'affiche aucun bandeau de marque au-dessus de la carte. Le contrôle de
position est un bouton GPS iconique : si l'autorisation est déjà accordée et les
services actifs, le point utilisateur apparaît dès l'ouverture sans recentrage forcé ;
un toucher demande l'autorisation si nécessaire, actualise le point et centre la carte.
La fiche de zone affiche seulement son centre géographique, et non ses quatre bornes.
L'attribution OpenFreeMap est accessible dans Réglages plutôt que superposée à cet écran.

### Carte

La carte occupe presque tout l'écran. Elle conserve un sélecteur de paramètre compact,
des actions flottantes, une timeline visible et une fiche ponctuelle en bottom sheet
ou carte flottante. Le pan et le zoom ne doivent jamais entrer en conflit avec un
défilement d'interface.

La météo domine visuellement le fond et les contrôles : isobares contrastées et
étiquetées, vecteurs de vent lisibles, légère teinte de pression non assimilable à une
heatmap, surfaces translucides compactes et transitions de frame de 150 à 250 ms. Un
contrôle de lecture automatique ne doit apparaître que lorsque cette lecture existe.

### Réglages

Les réglages contiennent uniquement des options qui ont un effet réel : unités,
langue, performance, stockage, confidentialité et informations de version. Une option
future reste absente plutôt que désactivée sans explication.

L'anglais est la langue de référence. Au premier lancement, l'application suit la
langue du téléphone : français pour une locale `fr`, anglais pour toute autre locale.
Le réglage de langue permet de conserver ce mode automatique ou de forcer English ou
Français ; le choix est local et persistant.

## Branding

- **Nom** : Gribzy.
- **Symbole** : ours blanc minimaliste porté par un mouvement d'air bleu.
- **Rôle du symbole** : launcher, splash, favicon et page À propos ; jamais une mascotte.
- **Valeurs** : simple, robuste, outdoor, offline, calme, rapide.
- **Palette** : bleu franc, blanc, gris très clair, texte bleu nuit ; rouge réservé aux erreurs.
- **Typographie** : Google Sans ou équivalent système lisible ; monospace uniquement
  pour coordonnées et données techniques.
- **Formes** : angles de 16 à 20 dp, ombres douces, aucun skeuomorphisme.
- **Dégradés** : réservés aux données météo ; le logo source existant constitue
  l'exception d'identité validée.

L'asset officiel est conservé dans `assets/images/gribzy-bear-source.png`. La version
1024 px avec marge de sécurité est utilisée par le launcher, le splash et le favicon.

## Performance — budgets produit

Ces valeurs sont des objectifs mesurables, pas des affirmations déjà validées :

- retour visuel au toucher en moins de 100 ms ;
- ouverture à chaud perçue en moins d'une seconde ;
- carte et gestes à 60 FPS sur l'appareil cible, sans chute durable sous 30 FPS ;
- aucun gel perceptible pendant le pincement ou le déplacement ;
- décodage d'un fichier typique sans bloquer durablement l'interface ;
- consultation locale possible sans requête réseau ;
- fonctionnement acceptable sur un Android milieu de gamme âgé de cinq ans.

Tout dépassement doit être mesuré sur appareil, documenté et traité avant d'ajouter
des couches ou animations coûteuses.

## Modèle économique et vie privée

- Aucune publicité.
- Aucun compte obligatoire.
- Aucun tracking comportemental.
- Aucune donnée personnelle vendue.
- La bêta est gratuite afin de valider la fiabilité, le fonctionnement hors ligne et
  l'adéquation du produit avec des utilisateurs réels.
- Après la bêta, Gribzy est proposé en **achat unique à 4,99 €**, sans abonnement.
- L'achat donne accès à l'application complète : aucune fonction météo essentielle
  n'est fragmentée en achats additionnels.
- Le prix local affiché par les stores peut être l'équivalent de 4,99 € selon le pays,
  la devise, les taxes et les paliers tarifaires de la plateforme.
- Les personnes participant à la bêta doivent être informées avant sa fin du passage
  au modèle payant et des conditions qui leur seront appliquées.

## Stratégie de lancement et marketing

### Positionnement

Gribzy est présenté comme un lecteur météo GRIB mobile, simple et offline-first pour
les activités outdoor. La communication vend d'abord la fiabilité sur le terrain :
préparer une zone avec du réseau, puis conserver pression et vent lorsque la connexion
disparaît.

Le prix unique de 4,99 € doit rester cohérent avec cette promesse de simplicité :
acheter une fois, sans compte, sans publicité et sans abonnement.

### Phase 1 — bêta gratuite

Objectifs :

- recruter des pratiquants de voile, randonnée, parapente et aviation légère ;
- prouver le téléchargement, le redémarrage et la lecture en mode avion ;
- recueillir les défauts d'alignement, de lisibilité et de performance ;
- obtenir des retours qualitatifs et des témoignages utilisables avec accord explicite ;
- mesurer la compréhension de la proposition de valeur et l'intention d'achat à 4,99 €.

La bêta ne doit pas être présentée comme une gratuité permanente. Les pages publiques
et invitations indiquent clairement « bêta gratuite » et « achat unique à 4,99 € prévu
après la bêta ».

### Phase 2 — lancement payant

Le lancement public intervient seulement après les critères « prêt pour bêta », les
contrôles scientifiques documentés et une phase de stabilisation avec les testeurs.

Messages prioritaires :

1. météo GRIB disponible hors ligne ;
2. pression et vent lisibles rapidement dehors ;
3. aucun compte, aucune publicité, aucun abonnement ;
4. achat unique à 4,99 €.

Les captures et textes marketing ne montrent que des capacités réellement livrées.
Les alertes officielles, limites scientifiques et usages de sécurité restent indiqués
sans ambiguïté.

### Canaux initiaux

- page publique Gribzy et fiche store ;
- communautés outdoor pertinentes, sans démarchage massif ;
- testeurs bêta et bouche-à-oreille ;
- démonstrations courtes du parcours téléchargement → mode avion → consultation ;
- contenu bilingue anglais/français.

### Indicateurs

La stratégie respecte l'absence de tracking comportemental. Les indicateurs privilégiés
sont agrégés ou fournis volontairement :

- nombre de candidatures et de testeurs actifs ;
- taux de parcours critiques validés sur appareil ;
- défauts bloquants et délai de résolution ;
- retours qualitatifs et intention d'achat déclarée ;
- téléchargements et achats agrégés communiqués par les stores.

Aucun SDK publicitaire ou outil de profilage n'est ajouté pour mesurer la conversion.

## Non-objectifs

- Gribzy n'est pas un logiciel de routage.
- Gribzy n'est pas un SIG généraliste.
- Gribzy n'est pas une copie de Windy ou PocketGrib.
- Gribzy n'est pas un réseau social.
- Gribzy ne remplace pas les sources météo officielles.
- Gribzy ne cherche pas à afficher le plus grand nombre de couches possible.
- Le MVP ne cherche pas à couvrir tous les modèles et encodages GRIB.

## Niveau d'avancement au 22 juillet 2026

Gribzy est une **alpha fonctionnelle**, pas encore une bêta. Le parcours minimal est
codé, mais n'a pas été validé de bout en bout sur appareils Android et iOS, en ligne
puis en mode avion.

| Domaine | État | Réalisation | Écart principal |
| --- | --- | --- | --- |
| Navigation | Terminé | Fichiers, Carte, Réglages ; barre flottante | Validation d'accessibilité réelle |
| Bibliothèque | Terminé | Import, liste, noms, ouverture, renommage, suppression, migration versionnée | Gros catalogue et migration à tester sur appareil |
| Sélection | Terminé | Monde, pan, pincement, bbox égale au viewport, GPS | Validation tactile réelle |
| Téléchargement | Partiel | Dernier run NOAA GFS, non destructif, état hors ligne explicite | Options fixes et comportement réseau à valider sur appareil |
| Lecture GRIB | Partiel | Pression, isobares et vent 10 m avec identité, niveau, grille et appariement stricts | Encodage ciblé ; validation croisée externe incomplète |
| Carte en ligne | Terminé | OpenFreeMap/MapLibre avec attribution | Validation sur APK |
| Carte hors ligne | Partiel | Natural Earth mondial embarqué | Détail local insuffisant |
| Point météo | Partiel | Vent et pression au point touché | Autres variables et lieu précis absents |
| Timeline | Partiel | 9 échéances GFS H+0 à H+24, précédent/suivant, slider et date UTC, hors ligne | Pas encore de lecture automatique |
| Réglages | Partiel | Langue automatique/anglais/français, informations et stockage réels | Autres options modifiables limitées |
| Branding | Terminé | Ours officiel, splash, launcher, favicon | Masques Android à vérifier |
| Qualité | Partiel | TypeScript, lint, 49 tests réseau/téléchargement/métadonnées/parser/frames, export | Tests UI et appareils absents |
| Distribution | Partiel | Profils APK/AAB configurés | Installation et stores à valider |

## Roadmap produit

### V1 — compagnon GRIB fiable

Objectif : prouver le parcours minimal sur Android puis iOS.

- sélection mondiale, GPS et téléchargement GFS ;
- bibliothèque locale sûre ;
- pression et vent sur carte en ligne/hors ligne ;
- état réseau explicite ;
- validation APK, redémarrage et mode avion ;
- accessibilité et performance mesurées.

Critère de sortie : tous les critères « prêt pour bêta » sont validés sur appareils.

### V2 — prévision dans le temps

Objectif : passer d'un état météo à une véritable prévision.

- plusieurs échéances GFS ;
- timeline, lecture, boucle et vitesse réelles ;
- choix progressif de durée ;
- pluie et température ;
- légende et transparence.
- décision technique puis premier paquet de carte locale détaillée, si sa licence et
  son budget de stockage sont validés.

### V3 — données et modèles adaptés à la zone

Objectif : améliorer la pertinence sans encombrer l'interface.

- choix progressif de résolution et paramètres ;
- nouveaux modèles uniquement avec chaîne complète et testée ;
- extension de la stratégie de carte détaillée hors ligne validée en V2 ;
- unités et performance réellement configurables.

### V4 — analyse locale

Objectif : comprendre l'évolution en un point.

- météogramme interactif ;
- table temporelle lisible ;
- humidité, nuages et vagues lorsque disponibles ;
- partage d'une fiche ou d'un fichier.

### V5 — intégrations utiles

Objectif : raccourcir l'accès à l'information sans transformer Gribzy en plateforme.

- widgets ou raccourcis uniquement s'ils fonctionnent hors ligne ;
- automatisations de mise à jour explicites et économes ;
- aucune fonctionnalité sociale ni dépendance obligatoire au cloud.

## Priorités immédiates

### P0

1. Tester le parcours complet sur APK Android, puis en mode avion.
2. Vérifier l'alignement carte/GRIB/inspection et les gestes.
3. Afficher clairement l'absence de connexion au téléchargement.
4. Tester redémarrage, interruption, stockage et icône adaptative.
5. Répéter le parcours critique sur iOS.

### P1

1. Valider sur appareil le téléchargement atomique et la timeline H+0 à H+24.
2. Mesurer le cache de trois frames et le changement d'échéance.
3. Ajouter pluie et température progressivement.
4. Définir la carte détaillée hors ligne et ses limites de stockage.

## Définition de « prêt pour bêta »

- Lint, TypeScript et tests sans erreur.
- Téléchargement interrompu sans perte.
- Plusieurs zones listables, ouvrables, renommables et supprimables.
- Relance en mode avion avec bibliothèque et lecture disponibles.
- Messages d'erreur visibles et actionnables.
- Alignement carte et données confirmé.
- Budgets de performance mesurés sur l'appareil Android cible.
- Parcours manuel validé sur au moins un appareil Android et un appareil iOS.
