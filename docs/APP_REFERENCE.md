# Gribzy — index de référence

Ce fichier est la porte d'entrée obligatoire avant toute modification de l'application.

## Sources de vérité

1. [`PRODUCT.md`](./PRODUCT.md) — pourquoi, vision, promesse, UX, branding,
   non-objectifs, état, roadmap et critères de bêta.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, fichiers, stockage, parser,
   cartographie, distribution et validation.
3. [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — lots ordonnés,
   dépendances, tâches techniques et critères d'acceptation.

En cas de contradiction, le produit définit **ce qui doit exister** et l'architecture
définit **comment l'implémenter**. Une contrainte de sécurité, d'intégrité des données,
de licence ou de plateforme ne peut jamais être ignorée silencieusement : l'écart doit
être documenté dans les deux fichiers.

## Mantra

> **La météo hors ligne pour celles et ceux qui vont dehors.**

Une fonctionnalité qui ne rend pas la consultation outdoor plus rapide, plus claire
ou plus fiable n'appartient probablement pas au MVP.

## État synthétique au 22 juillet 2026

Gribzy est une **alpha fonctionnelle**. Le socle minimal existe : bibliothèque locale,
sélection mondiale, GPS, téléchargement GFS ciblé, lecture pression/vent, carte
OpenFreeMap en ligne et fallback mondial hors ligne.

Les principaux écarts avant bêta sont :

1. validation complète sur appareils Android et iOS, notamment en mode avion ;
2. validation sur appareil de l'état de connectivité explicite avant téléchargement ;
3. plusieurs échéances GRIB et timeline réellement animable ;
4. fond hors ligne plus détaillé et légalement distribuable ;
5. paramètres météo additionnels utiles au contexte outdoor.

La priorité immédiate est le lot 0 du plan d'implémentation : prouver le parcours
existant sur appareil avant d'élargir le nombre de modèles, paramètres ou écrans.
