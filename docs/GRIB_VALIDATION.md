# Validation scientifique GRIB

Ce document sépare la validation logicielle de la validation scientifique. Les tests
automatiques prouvent que le sous-ensemble annoncé est décodé de façon déterministe ;
ils ne prouvent pas à eux seuls que les champs correspondent à une référence
météorologique indépendante.

## Sous-ensemble accepté

- GRIB2, messages contigus sans octets parasites ;
- discipline météorologique 0 ;
- template produit 4.0 ;
- PRMSL : catégorie 3, paramètre 1, surface moyenne de la mer 101 ;
- vent à 10 m : catégorie 2, paramètres 2/3, surface 103 à 10 m ;
- grille latitude/longitude régulière template 3.0, scanning mode 64 ;
- échelle angulaire standard ou basic angle/subdivisions explicites et cohérents ;
- packing simple template 5.0, sans bitmap.

Tout autre cas est refusé explicitement.

## PRMSL

- [x] discipline vérifiée automatiquement
- [x] niveau vérifié automatiquement
- [x] unité Pa confirmée par l'identité WMO puis conversion explicite en hPa
- [x] valeurs synthétiques exactes testées
- [ ] valeurs ponctuelles comparées à une sortie indépendante
- [ ] isobares comparées visuellement et numériquement
- [ ] testée sur plusieurs échéances réelles
- [ ] comparée avec XyGrib
- [ ] comparée avec PocketGrib

## Vent à 10 m

- [x] discipline vérifiée automatiquement
- [x] niveau 10 m au-dessus du sol vérifié automatiquement
- [x] unité m/s confirmée par l'identité WMO
- [x] U et V appariés par temps, niveau, processus et grille
- [x] U et V interpolés séparément avant vitesse et direction
- [ ] valeurs ponctuelles comparées à une sortie indépendante
- [ ] orientation des flèches comparée sur plusieurs régions
- [ ] testée sur plusieurs échéances réelles
- [ ] comparée avec XyGrib
- [ ] comparée avec PocketGrib

## Procédure de comparaison

Pour chaque fixture réelle, relever au minimum les quatre coins, le centre et deux
points non alignés sur la grille. Documenter le fichier source, son empreinte, le run,
l'échéance, les coordonnées, les valeurs Gribzy et celles des deux lecteurs de
référence. Une case reste décochée tant que cette preuve n'est pas enregistrée.
