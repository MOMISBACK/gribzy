# Fixtures GRIB

La fixture NOAA GFS est conservée en base64 dans `noaaFixture.ts` afin de rester
compatible avec Vitest sans étape de copie d'asset. Son manifeste de référence est
`noaa-gfs-5x5.manifest.json`.

Les messages synthétiques exacts sont construits octet par octet dans
`lib/gribParser.synthetic.test.ts`. Ils couvrent les variantes de packing et les
structures volontairement invalides sans présenter ces données fabriquées comme des
observations NOAA.
