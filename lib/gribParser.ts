export function readGribSignature(bytes: Uint8Array): string {
  if (bytes.byteLength < 4) return '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
}

export function isValidGrib(bytes: Uint8Array): boolean {
  return readGribSignature(bytes) === 'GRIB';
}

export interface GribMessage {
  offset: number;
  totalSize: number;
  discipline: number;
}

export function findGribMessages(bytes: Uint8Array): GribMessage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messages: GribMessage[] = [];
  let offset = 0;

  while (offset < bytes.length - 4) {
    if (
      view.getUint8(offset) === 71 &&
      view.getUint8(offset + 1) === 82 &&
      view.getUint8(offset + 2) === 73 &&
      view.getUint8(offset + 3) === 66
    ) {
      if (offset + 16 > bytes.length) break;
      const edition = view.getUint8(offset + 7);
      const totalSizeHigh = view.getUint32(offset + 8, false);
      const totalSize = view.getUint32(offset + 12, false);
      if (edition !== 2 || totalSizeHigh !== 0) {
        offset++;
        continue;
      }
      if (totalSize < 20 || offset + totalSize > bytes.length) {
        offset++;
        continue;
      }
      const discipline = view.getUint8(offset + 6);
      const terminator = offset + totalSize - 4;
      if (
        view.getUint8(terminator) !== 55 || view.getUint8(terminator + 1) !== 55 ||
        view.getUint8(terminator + 2) !== 55 || view.getUint8(terminator + 3) !== 55
      ) {
        offset++;
        continue;
      }
      messages.push({ offset, totalSize, discipline });
      offset += totalSize;
    } else {
      offset++;
    }
  }

  return messages;
}

export interface GribParameter {
  category: number;
  parameter: number;
  name: string;
}

export function readMessageParameter(bytes: Uint8Array, messageOffset: number): GribParameter {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = messageOffset + 16;
  const messageEnd = getMessageEnd(view, messageOffset, bytes.length);

  while (offset + 5 <= messageEnd) {
    const sectionSize = view.getUint32(offset, false);
    if (sectionSize < 5 || offset + sectionSize > messageEnd) break;
    const sectionNumber = view.getUint8(offset + 4);

    if (sectionNumber === 4) {
      const category = view.getUint8(offset + 9);
      const parameter = view.getUint8(offset + 10);

      let name = 'inconnu';
      if (category === 2 && parameter === 2) name = 'UGRD (vent U)';
      if (category === 2 && parameter === 3) name = 'VGRD (vent V)';
      if (category === 3 && parameter === 1) name = 'PRMSL (pression)';

      return { category, parameter, name };
    }

    if (sectionNumber === 1) {
      offset += 21;
    } else {
      offset += sectionSize;
    }
  }

  return { category: -1, parameter: -1, name: 'non trouvé' };
}

export interface GribDataRepresentation {
  numberOfValues: number;
  referenceValue: number;
  binaryScale: number;
  decimalScale: number;
  bitsPerValue: number;
}

export function readDataRepresentation(
  bytes: Uint8Array,
  messageOffset: number
): GribDataRepresentation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = messageOffset + 16;
  const messageEnd = getMessageEnd(view, messageOffset, bytes.length);

  while (offset + 5 <= messageEnd) {
    const sectionSize = view.getUint32(offset, false);
    if (sectionSize < 5 || offset + sectionSize > messageEnd) break;
    const sectionNumber = view.getUint8(offset + 4);

    if (sectionNumber === 5) {
      if (sectionSize < 21) throw new Error('Section 5 incomplète');
      const template = view.getUint16(offset + 9, false);
      if (template !== 0) throw new Error(`Packing GRIB non pris en charge (${template})`);
      const numberOfValues = view.getUint32(offset + 5, false);
      const referenceValue = view.getFloat32(offset + 11, false);
      const binaryScaleRaw = view.getInt16(offset + 15, false);
      const decimalScaleRaw = view.getInt16(offset + 17, false);
      const bitsPerValue = view.getUint8(offset + 19);

      return {
        numberOfValues,
        referenceValue,
        binaryScale: binaryScaleRaw,
        decimalScale: decimalScaleRaw,
        bitsPerValue,
      };
    }

    if (sectionNumber === 1) {
      offset += 21;
    } else {
      offset += sectionSize;
    }
  }

  throw new Error('Section 5 non trouvée');
}

export async function decodeValues(
  bytes: Uint8Array,
  messageOffset: number,
  repr: GribDataRepresentation
): Promise<Float32Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = messageOffset + 16;
  const messageEnd = getMessageEnd(view, messageOffset, bytes.length);

  while (offset + 5 <= messageEnd) {
    const sectionSize = view.getUint32(offset, false);
    if (sectionSize < 5 || offset + sectionSize > messageEnd) break;
    const sectionNumber = view.getUint8(offset + 4);

    if (sectionNumber === 7) {
      const dataOffset = offset + 5;
      const { referenceValue, binaryScale, decimalScale, bitsPerValue, numberOfValues } = repr;

      const R = referenceValue;
      const E = Math.pow(2, binaryScale);
      const D = Math.pow(10, decimalScale);
      const values = new Float32Array(numberOfValues);
      const CHUNK = 50000;

      if (bitsPerValue > 31) throw new Error(`Profondeur GRIB non prise en charge (${bitsPerValue} bits)`);
      if (dataOffset + Math.ceil((numberOfValues * bitsPerValue) / 8) > offset + sectionSize) {
        throw new Error('Données GRIB tronquées');
      }

      for (let start = 0; start < numberOfValues; start += CHUNK) {
        const end = Math.min(start + CHUNK, numberOfValues);

        for (let i = start; i < end; i++) {
          let packedValue = 0;
          const firstBit = i * bitsPerValue;
          for (let bit = 0; bit < bitsPerValue; bit++) {
            const absoluteBit = firstBit + bit;
            const byte = view.getUint8(dataOffset + Math.floor(absoluteBit / 8));
            packedValue = packedValue * 2 + ((byte >> (7 - (absoluteBit % 8))) & 1);
          }
          values[i] = (R + packedValue * E) / D;
        }

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      return values;
    }

    if (sectionNumber === 1) {
      offset += 21;
    } else {
      offset += sectionSize;
    }
  }

  throw new Error('Section 7 non trouvée');
}

export interface GribGrid {
  ni: number;        // nombre de colonnes (longitude)
  nj: number;        // nombre de lignes (latitude)
  lat1: number;      // latitude du premier point
  lon1: number;      // longitude du premier point
  lat2: number;      // latitude du dernier point
  lon2: number;      // longitude du dernier point
  template: number;
  scanningMode: number;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function readGridDefinition(
  bytes: Uint8Array,
  messageOffset: number
): GribGrid {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = messageOffset + 16;
  const messageEnd = getMessageEnd(view, messageOffset, bytes.length);

  while (offset + 5 <= messageEnd) {
    const sectionSize = view.getUint32(offset, false);
    if (sectionSize < 5 || offset + sectionSize > messageEnd) break;
    const sectionNumber = view.getUint8(offset + 4);

    if (sectionNumber === 3) {
      if (sectionSize < 72) throw new Error('Section 3 incomplète');
      const template = view.getUint16(offset + 12, false);
      if (template !== 0) throw new Error(`Grille GRIB non prise en charge (${template})`);
      // ni et nj : nombre de points en longitude et latitude
      const ni = view.getUint32(offset + 30, false);
      const nj = view.getUint32(offset + 34, false);

      // lat/lon en micro-degrés (divisés par 1e6 pour avoir des degrés)
      const lat1 = view.getInt32(offset + 46, false) / 1e6;
      const lon1 = normalizeLongitude(view.getInt32(offset + 50, false) / 1e6);
      const lat2 = view.getInt32(offset + 55, false) / 1e6;
      const lon2 = normalizeLongitude(view.getInt32(offset + 59, false) / 1e6);
      const scanningMode = view.getUint8(offset + 71);

      return { ni, nj, lat1, lon1, lat2, lon2, template, scanningMode };
    }

    if (sectionNumber === 1) {
      offset += 21;
    } else {
      offset += sectionSize;
    }
  }

  throw new Error('Section 3 non trouvée');
}

export function readBitmapIndicator(bytes: Uint8Array, messageOffset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = messageOffset + 16;
  const messageEnd = getMessageEnd(view, messageOffset, bytes.length);
  while (offset + 6 <= messageEnd) {
    const sectionSize = view.getUint32(offset, false);
    if (sectionSize < 5 || offset + sectionSize > messageEnd) break;
    if (view.getUint8(offset + 4) === 6) return view.getUint8(offset + 5);
    offset += sectionNumberStep(view.getUint8(offset + 4), sectionSize);
  }
  return 255;
}

function sectionNumberStep(sectionNumber: number, sectionSize: number): number {
  return sectionNumber === 1 ? 21 : sectionSize;
}

export interface ValidatedGrib {
  messages: GribMessage[];
  pressure: GribMessage;
  windU?: GribMessage;
  windV?: GribMessage;
  grid: GribGrid;
}

export function validateGribForApp(bytes: Uint8Array): ValidatedGrib {
  const messages = findGribMessages(bytes);
  if (messages.length === 0) throw new Error('Aucun message GRIB2 valide');
  const pressure = messages.find(message => readMessageParameter(bytes, message.offset).name.includes('pression'));
  if (!pressure) throw new Error('Pression au niveau de la mer absente');
  const windU = messages.find(message => readMessageParameter(bytes, message.offset).name.includes('vent U'));
  const windV = messages.find(message => readMessageParameter(bytes, message.offset).name.includes('vent V'));
  if ((windU && !windV) || (!windU && windV)) throw new Error('Composantes du vent incomplètes');

  const grid = readGridDefinition(bytes, pressure.offset);
  if (grid.scanningMode !== 64) {
    throw new Error(`Ordre de balayage GRIB non pris en charge (${grid.scanningMode})`);
  }
  const candidates = [pressure, windU, windV].filter((message): message is GribMessage => !!message);
  for (const message of candidates) {
    const messageGrid = readGridDefinition(bytes, message.offset);
    if (messageGrid.ni !== grid.ni || messageGrid.nj !== grid.nj || messageGrid.lat1 !== grid.lat1 ||
        messageGrid.lat2 !== grid.lat2 || messageGrid.lon1 !== grid.lon1 || messageGrid.lon2 !== grid.lon2) {
      throw new Error('Les paramètres GRIB n’utilisent pas la même grille');
    }
    if (messageGrid.scanningMode !== grid.scanningMode) throw new Error('Ordres de balayage GRIB incohérents');
    if (readBitmapIndicator(bytes, message.offset) !== 255) {
      throw new Error('Bitmap GRIB non pris en charge');
    }
    const representation = readDataRepresentation(bytes, message.offset);
    if (representation.numberOfValues !== grid.ni * grid.nj) {
      throw new Error('Dimensions GRIB incohérentes');
    }
  }
  return { messages, pressure, windU, windV, grid };
}

function getMessageEnd(view: DataView, messageOffset: number, byteLength: number): number {
  if (messageOffset < 0 || messageOffset + 16 > byteLength) {
    throw new Error('En-tête GRIB incomplet');
  }
  const totalSize = view.getUint32(messageOffset + 12, false);
  const end = messageOffset + totalSize;
  if (totalSize < 20 || end > byteLength) throw new Error('Message GRIB tronqué');
  return end;
}
export interface IsobareLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function computeIsobares(
  values: Float32Array,
  ni: number,
  nj: number,
  levels: number[]  // ex: [1000, 1004, 1008, 1012, 1016, 1020]
): Map<number, IsobareLine[]> {
  const result = new Map<number, IsobareLine[]>();

  for (const level of levels) {
    const lines: IsobareLine[] = [];

    for (let j = 0; j < nj - 1; j++) {
      for (let i = 0; i < ni - 1; i++) {
        // les 4 coins de la cellule
        const a = values[j * ni + i];           // haut gauche
        const b = values[j * ni + (i + 1)];     // haut droite
        const c = values[(j + 1) * ni + (i + 1)]; // bas droite
        const d = values[(j + 1) * ni + i];     // bas gauche

        // code marching squares : 1 si > level, 0 sinon
        const code =
          (a > level ? 8 : 0) |
          (b > level ? 4 : 0) |
          (c > level ? 2 : 0) |
          (d > level ? 1 : 0);

        if (code === 0 || code === 15) continue; // tout d'un côté, pas de ligne

        // interpolation linéaire : où exactement la ligne croise chaque bord
        const top    = (a === b) ? 0.5 : (level - a) / (b - a); // entre a et b
        const right  = (b === c) ? 0.5 : (level - b) / (c - b); // entre b et c
        const bottom = (d === c) ? 0.5 : (level - d) / (c - d); // entre d et c
        const left   = (a === d) ? 0.5 : (level - a) / (d - a); // entre a et d

        // coordonnées en espace grille (0..1 par cellule)
        const x = i;
        const y = j;

        // les 4 points d'intersection possibles
        const T = { x: x + top,    y: y };
        const R = { x: x + 1,      y: y + right };
        const B = { x: x + bottom, y: y + 1 };
        const L = { x: x,          y: y + left };

        // les 16 cas
        switch (code) {
          case 1:  lines.push({ x1: L.x, y1: L.y, x2: B.x, y2: B.y }); break;
          case 2:  lines.push({ x1: B.x, y1: B.y, x2: R.x, y2: R.y }); break;
          case 3:  lines.push({ x1: L.x, y1: L.y, x2: R.x, y2: R.y }); break;
          case 4:  lines.push({ x1: T.x, y1: T.y, x2: R.x, y2: R.y }); break;
          case 5:
            lines.push({ x1: T.x, y1: T.y, x2: B.x, y2: B.y });
            lines.push({ x1: L.x, y1: L.y, x2: R.x, y2: R.y });
            break;
          case 6:  lines.push({ x1: T.x, y1: T.y, x2: B.x, y2: B.y }); break;
          case 7:  lines.push({ x1: T.x, y1: T.y, x2: L.x, y2: L.y }); break;
          case 8:  lines.push({ x1: T.x, y1: T.y, x2: L.x, y2: L.y }); break;
          case 9:  lines.push({ x1: T.x, y1: T.y, x2: B.x, y2: B.y }); break;
          case 10:
            lines.push({ x1: T.x, y1: T.y, x2: R.x, y2: R.y });
            lines.push({ x1: L.x, y1: L.y, x2: B.x, y2: B.y });
            break;
          case 11: lines.push({ x1: T.x, y1: T.y, x2: R.x, y2: R.y }); break;
          case 12: lines.push({ x1: L.x, y1: L.y, x2: R.x, y2: R.y }); break;
          case 13: lines.push({ x1: B.x, y1: B.y, x2: R.x, y2: R.y }); break;
          case 14: lines.push({ x1: L.x, y1: L.y, x2: B.x, y2: B.y }); break;
        }
      }
    }

    result.set(level, lines);
  }

  return result;
}
