export class GribValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GribValidationError';
  }
}

function fail(code: string, message: string): never {
  throw new GribValidationError(code, message);
}

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) fail('NON_FINITE_VALUE', `Non-finite GRIB ${label}`);
  return value;
}

function signedMagnitude8(value: number): number {
  return (value & 0x80) !== 0 ? -(value & 0x7f) : value;
}

function signedMagnitude16(view: DataView, offset: number): number {
  const value = view.getUint16(offset, false);
  return (value & 0x8000) !== 0 ? -(value & 0x7fff) : value;
}

function signedMagnitude32(view: DataView, offset: number): number {
  const value = view.getUint32(offset, false);
  return (value & 0x80000000) !== 0 ? -(value & 0x7fffffff) : value;
}

export function readGribSignature(bytes: Uint8Array): string {
  if (bytes.byteLength < 4) return '';
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

export function isValidGrib(bytes: Uint8Array): boolean {
  try {
    return findGribMessages(bytes).length > 0;
  } catch {
    return false;
  }
}

export interface GribMessage {
  offset: number;
  totalSize: number;
  discipline: number;
}

interface GribSection {
  number: number;
  offset: number;
  size: number;
}

interface ParsedMessageStructure extends GribMessage {
  sections: Map<number, GribSection>;
}

const SECTION_MINIMUMS: Record<number, number> = {
  1: 21,
  2: 5,
  3: 14,
  4: 9,
  5: 11,
  6: 6,
  7: 5,
};

function parseMessageStructure(
  bytes: Uint8Array,
  messageOffset: number,
  advertisedSize?: number
): ParsedMessageStructure {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (messageOffset < 0 || messageOffset + 16 > bytes.length) {
    fail('INVALID_STRUCTURE', 'Incomplete GRIB indicator section');
  }
  if (readAscii(view, messageOffset, 4) !== 'GRIB' || view.getUint8(messageOffset + 7) !== 2) {
    fail('INVALID_STRUCTURE', 'Invalid GRIB2 indicator section');
  }
  const highSize = view.getUint32(messageOffset + 8, false);
  if (highSize !== 0) fail('UNSUPPORTED_MESSAGE_SIZE', 'GRIB messages larger than 4 GiB are not supported');
  const totalSize = view.getUint32(messageOffset + 12, false);
  if (advertisedSize !== undefined && totalSize !== advertisedSize) {
    fail('INVALID_STRUCTURE', 'Inconsistent GRIB message length');
  }
  const end = messageOffset + totalSize;
  if (totalSize < 20 || end > bytes.length) fail('INVALID_STRUCTURE', 'Truncated GRIB message');
  if (readAscii(view, end - 4, 4) !== '7777') fail('INVALID_STRUCTURE', 'Missing GRIB end marker');

  const sections = new Map<number, GribSection>();
  const expected = [1, 3, 4, 5, 6, 7];
  let expectedIndex = 0;
  let cursor = messageOffset + 16;
  while (cursor < end - 4) {
    if (cursor + 5 > end - 4) fail('INVALID_STRUCTURE', 'Truncated GRIB section header');
    const size = view.getUint32(cursor, false);
    const number = view.getUint8(cursor + 4);
    if (!(number in SECTION_MINIMUMS) || size < SECTION_MINIMUMS[number]) {
      fail('INVALID_STRUCTURE', `Invalid GRIB section ${number}`);
    }
    if (cursor + size > end - 4) fail('INVALID_STRUCTURE', `GRIB section ${number} exceeds the message`);
    if (number === 2) {
      if (expectedIndex !== 1 || sections.has(2)) fail('INVALID_STRUCTURE', 'GRIB section 2 is out of order');
    } else {
      if (number !== expected[expectedIndex]) fail('INVALID_STRUCTURE', `GRIB section ${number} is out of order`);
      expectedIndex++;
    }
    if (sections.has(number)) fail('INVALID_STRUCTURE', `Duplicate GRIB section ${number}`);
    sections.set(number, { number, offset: cursor, size });
    cursor += size;
  }
  if (cursor !== end - 4 || expectedIndex !== expected.length) {
    fail('INVALID_STRUCTURE', 'Incomplete GRIB section sequence');
  }
  return {
    offset: messageOffset,
    totalSize,
    discipline: view.getUint8(messageOffset + 6),
    sections,
  };
}

function structures(bytes: Uint8Array): ParsedMessageStructure[] {
  const messages: ParsedMessageStructure[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length || readAscii(view, cursor, 4) !== 'GRIB') {
      fail('INVALID_STRUCTURE', `Unexpected data outside a GRIB message at byte ${cursor}`);
    }
    const message = parseMessageStructure(bytes, cursor);
    messages.push(message);
    cursor += message.totalSize;
  }
  return messages;
}

export function findGribMessages(bytes: Uint8Array): GribMessage[] {
  if (bytes.length === 0) return [];
  return structures(bytes).map(({ offset, totalSize, discipline }) => ({ offset, totalSize, discipline }));
}

function structureAt(bytes: Uint8Array, messageOffset: number): ParsedMessageStructure {
  return parseMessageStructure(bytes, messageOffset);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index++) result += String.fromCharCode(view.getUint8(offset + index));
  return result;
}

export interface GribFieldIdentity {
  discipline: number;
  category: number;
  parameter: number;
  productDefinitionTemplate: number;
  referenceTime: string;
  forecastTime: number;
  forecastTimeUnit: number;
  firstSurfaceType: number;
  firstSurfaceScaleFactor: number;
  firstSurfaceScaledValue: number;
  secondSurfaceType?: number;
  secondSurfaceScaleFactor?: number;
  secondSurfaceScaledValue?: number;
  generatingProcessType?: number;
  generatingProcessId?: number;
  ensembleMember?: number;
}

export interface GribParameter {
  category: number;
  parameter: number;
  name: string;
}

function readReferenceTime(view: DataView, section: GribSection): string {
  if (section.size < 21) fail('INVALID_STRUCTURE', 'Incomplete GRIB section 1');
  const year = view.getUint16(section.offset + 12, false);
  const month = view.getUint8(section.offset + 14);
  const day = view.getUint8(section.offset + 15);
  const hour = view.getUint8(section.offset + 16);
  const minute = view.getUint8(section.offset + 17);
  const second = view.getUint8(section.offset + 18);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second
  ) {
    fail('INVALID_STRUCTURE', 'Invalid GRIB reference time');
  }
  return date.toISOString();
}

function optionalSurface(
  view: DataView,
  typeOffset: number
): Pick<GribFieldIdentity, 'secondSurfaceType' | 'secondSurfaceScaleFactor' | 'secondSurfaceScaledValue'> {
  const type = view.getUint8(typeOffset);
  const scale = view.getUint8(typeOffset + 1);
  const value = view.getUint32(typeOffset + 2, false);
  if (type === 255 && scale === 255 && value === 0xffffffff) return {};
  return {
    secondSurfaceType: type,
    secondSurfaceScaleFactor: signedMagnitude8(scale),
    secondSurfaceScaledValue: signedMagnitude32(view, typeOffset + 2),
  };
}

export function readFieldIdentity(bytes: Uint8Array, messageOffset: number): GribFieldIdentity {
  const message = structureAt(bytes, messageOffset);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const section1 = message.sections.get(1)!;
  const section4 = message.sections.get(4)!;
  const offset = section4.offset;
  const productDefinitionTemplate = view.getUint16(offset + 7, false);
  if (productDefinitionTemplate !== 0) {
    fail('UNSUPPORTED_PRODUCT_TEMPLATE', `Unsupported GRIB product definition template (${productDefinitionTemplate})`);
  }
  if (section4.size < 34) fail('INVALID_STRUCTURE', 'Incomplete GRIB product definition');
  return {
    discipline: message.discipline,
    category: view.getUint8(offset + 9),
    parameter: view.getUint8(offset + 10),
    productDefinitionTemplate,
    referenceTime: readReferenceTime(view, section1),
    forecastTime: view.getUint32(offset + 18, false),
    forecastTimeUnit: view.getUint8(offset + 17),
    firstSurfaceType: view.getUint8(offset + 22),
    firstSurfaceScaleFactor: signedMagnitude8(view.getUint8(offset + 23)),
    firstSurfaceScaledValue: signedMagnitude32(view, offset + 24),
    ...optionalSurface(view, offset + 28),
    generatingProcessType: view.getUint8(offset + 11),
    generatingProcessId: view.getUint8(offset + 13),
  };
}

export function isMeanSeaLevelPressureField(identity: GribFieldIdentity): boolean {
  return identity.discipline === 0 && identity.category === 3 && identity.parameter === 1 &&
    identity.productDefinitionTemplate === 0 && identity.firstSurfaceType === 101;
}

export function isTenMeterWindField(identity: GribFieldIdentity): boolean {
  return identity.discipline === 0 && identity.category === 2 &&
    (identity.parameter === 2 || identity.parameter === 3) &&
    identity.productDefinitionTemplate === 0 && identity.firstSurfaceType === 103 &&
    identity.firstSurfaceScaleFactor === 0 && identity.firstSurfaceScaledValue === 10;
}

export function readMessageParameter(bytes: Uint8Array, messageOffset: number): GribParameter {
  const identity = readFieldIdentity(bytes, messageOffset);
  let name = 'unknown';
  if (isMeanSeaLevelPressureField(identity)) name = 'PRMSL (pressure)';
  if (isTenMeterWindField(identity) && identity.parameter === 2) name = 'UGRD (U wind)';
  if (isTenMeterWindField(identity) && identity.parameter === 3) name = 'VGRD (V wind)';
  return { category: identity.category, parameter: identity.parameter, name };
}

export interface GribDataRepresentation {
  numberOfValues: number;
  referenceValue: number;
  binaryScale: number;
  decimalScale: number;
  bitsPerValue: number;
}

export function readDataRepresentation(bytes: Uint8Array, messageOffset: number): GribDataRepresentation {
  const message = structureAt(bytes, messageOffset);
  const section = message.sections.get(5)!;
  if (section.size < 21) fail('INVALID_STRUCTURE', 'Incomplete GRIB section 5');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const template = view.getUint16(section.offset + 9, false);
  if (template !== 0) fail('UNSUPPORTED_PACKING', `Unsupported GRIB packing (${template})`);
  const referenceValue = assertFinite(view.getFloat32(section.offset + 11, false), 'reference value');
  return {
    numberOfValues: view.getUint32(section.offset + 5, false),
    referenceValue,
    binaryScale: signedMagnitude16(view, section.offset + 15),
    decimalScale: signedMagnitude16(view, section.offset + 17),
    bitsPerValue: view.getUint8(section.offset + 19),
  };
}

export async function decodeValues(
  bytes: Uint8Array,
  messageOffset: number,
  representation: GribDataRepresentation
): Promise<Float32Array> {
  const message = structureAt(bytes, messageOffset);
  const section = message.sections.get(7)!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { referenceValue, binaryScale, decimalScale, bitsPerValue, numberOfValues } = representation;
  if (bitsPerValue > 31) fail('UNSUPPORTED_BIT_DEPTH', `Unsupported GRIB bit depth (${bitsPerValue} bits)`);
  const byteCount = Math.ceil(numberOfValues * bitsPerValue / 8);
  if (section.size !== 5 + byteCount) fail('INVALID_STRUCTURE', 'Inconsistent GRIB section 7 length');
  const binaryMultiplier = assertFinite(2 ** binaryScale, 'binary scale');
  const decimalDivisor = assertFinite(10 ** decimalScale, 'decimal scale');
  if (decimalDivisor === 0) fail('NON_FINITE_VALUE', 'Invalid GRIB decimal scale');

  const values = new Float32Array(numberOfValues);
  const dataOffset = section.offset + 5;
  const chunkSize = 50_000;
  for (let start = 0; start < numberOfValues; start += chunkSize) {
    const end = Math.min(start + chunkSize, numberOfValues);
    for (let index = start; index < end; index++) {
      let packedValue = 0;
      const firstBit = index * bitsPerValue;
      for (let bit = 0; bit < bitsPerValue; bit++) {
        const absoluteBit = firstBit + bit;
        const byte = view.getUint8(dataOffset + Math.floor(absoluteBit / 8));
        packedValue = packedValue * 2 + ((byte >> (7 - absoluteBit % 8)) & 1);
      }
      const value = (referenceValue + packedValue * binaryMultiplier) / decimalDivisor;
      values[index] = assertFinite(value, `decoded value ${index}`);
      if (!Number.isFinite(values[index])) fail('NON_FINITE_VALUE', `Non-finite GRIB decoded value ${index}`);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return values;
}

export interface GribGrid {
  ni: number;
  nj: number;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  di: number;
  dj: number;
  basicAngle: number;
  subdivisionsOfBasicAngle: number;
  template: number;
  scanningMode: number;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function closeEnough(actual: number, expected: number, angularUnit: number): boolean {
  return Math.abs(actual - expected) <= Math.max(angularUnit * 2, 1e-7);
}

export function readGridDefinition(bytes: Uint8Array, messageOffset: number): GribGrid {
  const message = structureAt(bytes, messageOffset);
  const section = message.sections.get(3)!;
  if (section.size < 72) fail('INVALID_STRUCTURE', 'Incomplete GRIB section 3');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = section.offset;
  if (view.getUint8(offset + 10) !== 0 || view.getUint8(offset + 11) !== 0 || section.size !== 72) {
    fail('UNSUPPORTED_QUASI_REGULAR_GRID', 'Quasi-regular GRIB grids and optional lists are not supported');
  }
  const template = view.getUint16(offset + 12, false);
  if (template !== 0) fail('UNSUPPORTED_GRID_TEMPLATE', `Unsupported GRIB grid template (${template})`);
  const ni = view.getUint32(offset + 30, false);
  const nj = view.getUint32(offset + 34, false);
  if (ni < 2 || nj < 2 || ni === 0xffffffff || nj === 0xffffffff) {
    fail('INVALID_GRID_GEOMETRY', 'Invalid GRIB grid dimensions');
  }
  const basicAngleRaw = view.getUint32(offset + 38, false);
  const subdivisionsRaw = view.getUint32(offset + 42, false);
  const standardAngle = basicAngleRaw === 0 && subdivisionsRaw === 0xffffffff;
  if (!standardAngle && (basicAngleRaw === 0 || subdivisionsRaw === 0 || subdivisionsRaw === 0xffffffff)) {
    fail('UNSUPPORTED_ANGULAR_SCALE', 'Unsupported GRIB angular scale');
  }
  const basicAngle = standardAngle ? 1 : basicAngleRaw;
  const subdivisionsOfBasicAngle = standardAngle ? 1_000_000 : subdivisionsRaw;
  const angularUnit = basicAngle / subdivisionsOfBasicAngle;
  const lat1 = assertFinite(signedMagnitude32(view, offset + 46) * angularUnit, 'latitude');
  const lon1 = normalizeLongitude(assertFinite(signedMagnitude32(view, offset + 50) * angularUnit, 'longitude'));
  const lat2 = assertFinite(signedMagnitude32(view, offset + 55) * angularUnit, 'latitude');
  const lon2 = normalizeLongitude(assertFinite(signedMagnitude32(view, offset + 59) * angularUnit, 'longitude'));
  const di = assertFinite(view.getUint32(offset + 63, false) * angularUnit, 'longitude increment');
  const dj = assertFinite(view.getUint32(offset + 67, false) * angularUnit, 'latitude increment');
  const scanningMode = view.getUint8(offset + 71);
  if (scanningMode !== 64) fail('UNSUPPORTED_SCANNING_MODE', `Unsupported GRIB scanning mode (${scanningMode})`);
  if (di <= 0 || dj <= 0) fail('INVALID_GRID_GEOMETRY', 'Invalid GRIB grid increments');
  if (lon2 < lon1 || lon1 + (ni - 1) * di > 180 + Math.max(di, angularUnit)) {
    fail('ANTIMERIDIAN_UNSUPPORTED', 'GRIB grids crossing the antimeridian are not supported yet');
  }
  if (!closeEnough(lon2, lon1 + (ni - 1) * di, angularUnit) ||
      !closeEnough(lat2, lat1 + (nj - 1) * dj, angularUnit)) {
    fail('INVALID_GRID_GEOMETRY', 'Inconsistent GRIB grid geometry');
  }
  const declaredPoints = view.getUint32(offset + 6, false);
  if (declaredPoints !== ni * nj) fail('INVALID_GRID_GEOMETRY', 'Inconsistent GRIB grid point count');
  return {
    ni, nj, lat1, lon1, lat2, lon2, di, dj,
    basicAngle, subdivisionsOfBasicAngle, template, scanningMode,
  };
}

export function gridIndexToLatLon(
  i: number,
  j: number,
  grid: GribGrid
): { latitude: number; longitude: number } {
  if (!Number.isFinite(i) || !Number.isFinite(j) || i < 0 || j < 0 || i > grid.ni - 1 || j > grid.nj - 1) {
    fail('INVALID_GRID_INDEX', 'Grid index is outside the GRIB grid');
  }
  return {
    latitude: assertFinite(grid.lat1 + j * grid.dj, 'projected latitude'),
    longitude: assertFinite(grid.lon1 + i * grid.di, 'projected longitude'),
  };
}

export function latLonToFractionalGridIndex(
  latitude: number,
  longitude: number,
  grid: GribGrid
): { i: number; j: number } | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const i = (longitude - grid.lon1) / grid.di;
  const j = (latitude - grid.lat1) / grid.dj;
  const epsilon = 1e-7;
  if (i < -epsilon || j < -epsilon || i > grid.ni - 1 + epsilon || j > grid.nj - 1 + epsilon) return null;
  return {
    i: Math.max(0, Math.min(grid.ni - 1, i)),
    j: Math.max(0, Math.min(grid.nj - 1, j)),
  };
}

export function bilinearInterpolate(
  values: Float32Array | number[],
  ni: number,
  nj: number,
  i: number,
  j: number
): number | null {
  if (values.length !== ni * nj || ni < 1 || nj < 1 || !Number.isFinite(i) || !Number.isFinite(j) ||
      i < 0 || j < 0 || i > ni - 1 || j > nj - 1) return null;
  const i0 = Math.floor(i);
  const j0 = Math.floor(j);
  const i1 = Math.min(i0 + 1, ni - 1);
  const j1 = Math.min(j0 + 1, nj - 1);
  const samples = [
    values[j0 * ni + i0], values[j0 * ni + i1],
    values[j1 * ni + i0], values[j1 * ni + i1],
  ];
  if (!samples.every(Number.isFinite)) return null;
  const tx = i - i0;
  const ty = j - j0;
  const top = samples[0] * (1 - tx) + samples[1] * tx;
  const bottom = samples[2] * (1 - tx) + samples[3] * tx;
  const result = top * (1 - ty) + bottom * ty;
  return Number.isFinite(result) ? result : null;
}

export function readBitmapIndicator(bytes: Uint8Array, messageOffset: number): number {
  const message = structureAt(bytes, messageOffset);
  const section = message.sections.get(6)!;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint8(section.offset + 5);
}

export interface ParsedGribField {
  message: GribMessage;
  identity: GribFieldIdentity;
  grid: GribGrid;
  representation: GribDataRepresentation;
}

function sameGrid(left: GribGrid, right: GribGrid): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildFieldMatchKey(field: ParsedGribField): string {
  const { identity, grid } = field;
  return JSON.stringify({
    discipline: identity.discipline,
    referenceTime: identity.referenceTime,
    forecastTime: identity.forecastTime,
    forecastTimeUnit: identity.forecastTimeUnit,
    firstSurfaceType: identity.firstSurfaceType,
    firstSurfaceScaleFactor: identity.firstSurfaceScaleFactor,
    firstSurfaceScaledValue: identity.firstSurfaceScaledValue,
    secondSurfaceType: identity.secondSurfaceType,
    secondSurfaceScaleFactor: identity.secondSurfaceScaleFactor,
    secondSurfaceScaledValue: identity.secondSurfaceScaledValue,
    productDefinitionTemplate: identity.productDefinitionTemplate,
    generatingProcessType: identity.generatingProcessType,
    generatingProcessId: identity.generatingProcessId,
    ensembleMember: identity.ensembleMember,
    grid,
  });
}

export interface ValidatedGrib {
  messages: GribMessage[];
  fields: ParsedGribField[];
  pressure: GribMessage;
  pressureField: ParsedGribField;
  windU?: GribMessage;
  windV?: GribMessage;
  windUField?: ParsedGribField;
  windVField?: ParsedGribField;
  grid: GribGrid;
  diagnostics: GribLayerDiagnostic[];
}

export interface GribLayerDiagnostic {
  layer: 'pressure' | 'wind' | 'frame';
  severity: 'info' | 'warning' | 'error';
  code:
    | 'PRESSURE_MISSING'
    | 'WIND_U_MISSING'
    | 'WIND_V_MISSING'
    | 'WIND_COMPONENTS_MISMATCHED'
    | 'UNSUPPORTED_FIELD'
    | 'NO_USABLE_LAYER';
  message: string;
}

export interface AnalyzedGrib {
  messages: GribMessage[];
  fields: ParsedGribField[];
  pressureField?: ParsedGribField;
  windUField?: ParsedGribField;
  windVField?: ParsedGribField;
  diagnostics: GribLayerDiagnostic[];
}

export function analyzeGribForApp(bytes: Uint8Array): AnalyzedGrib {
  const messages = findGribMessages(bytes);
  if (messages.length === 0) fail('INVALID_STRUCTURE', 'No valid GRIB2 message');
  const fields = messages.map(message => {
    const identity = readFieldIdentity(bytes, message.offset);
    const grid = readGridDefinition(bytes, message.offset);
    const representation = readDataRepresentation(bytes, message.offset);
    if (readBitmapIndicator(bytes, message.offset) !== 255) {
      fail('UNSUPPORTED_BITMAP', 'GRIB bitmaps are not supported');
    }
    if (representation.numberOfValues !== grid.ni * grid.nj) {
      fail('INVALID_GRID_GEOMETRY', 'Inconsistent GRIB data point count');
    }
    const section7 = structureAt(bytes, message.offset).sections.get(7)!;
    if (section7.size !== 5 + Math.ceil(representation.numberOfValues * representation.bitsPerValue / 8)) {
      fail('INVALID_STRUCTURE', 'Inconsistent GRIB packed data length');
    }
    return { message, identity, grid, representation };
  });

  const diagnostics: GribLayerDiagnostic[] = [];
  const pressureField = fields.find(field => isMeanSeaLevelPressureField(field.identity));
  if (!pressureField) diagnostics.push({
    layer: 'pressure', severity: 'warning', code: 'PRESSURE_MISSING',
    message: 'Mean sea-level pressure is unavailable at this forecast time',
  });
  const windFields = fields.filter(field => isTenMeterWindField(field.identity));
  const uFields = windFields.filter(field => field.identity.parameter === 2);
  const vFields = windFields.filter(field => field.identity.parameter === 3);
  let windUField: ParsedGribField | undefined;
  let windVField: ParsedGribField | undefined;
  for (const u of uFields) {
    const key = buildFieldMatchKey(u);
    const v = vFields.find(candidate => buildFieldMatchKey(candidate) === key);
    if (v) {
      windUField = u;
      windVField = v;
      break;
    }
  }
  if (!windUField || !windVField) {
    if (uFields.length === 0) diagnostics.push({
      layer: 'wind', severity: 'warning', code: 'WIND_U_MISSING',
      message: 'The 10 m U wind component is unavailable',
    });
    if (vFields.length === 0) diagnostics.push({
      layer: 'wind', severity: 'warning', code: 'WIND_V_MISSING',
      message: 'The 10 m V wind component is unavailable',
    });
    if (uFields.length > 0 && vFields.length > 0) diagnostics.push({
      layer: 'wind', severity: 'error', code: 'WIND_COMPONENTS_MISMATCHED',
      message: 'The 10 m wind components do not describe the same forecast field',
    });
  }
  if (pressureField && windUField && windVField &&
      (!sameGrid(pressureField.grid, windUField.grid) || !sameGrid(pressureField.grid, windVField.grid))) {
    diagnostics.push({
      layer: 'wind', severity: 'error', code: 'WIND_COMPONENTS_MISMATCHED',
      message: 'Pressure and wind do not use the same GRIB grid',
    });
    windUField = undefined;
    windVField = undefined;
  }
  if (!pressureField && (!windUField || !windVField)) {
    diagnostics.push({
      layer: 'frame', severity: 'error', code: 'NO_USABLE_LAYER',
      message: 'No usable weather layer exists at this forecast time',
    });
  }
  return { messages, fields, pressureField, windUField, windVField, diagnostics };
}

export function validateGribForApp(bytes: Uint8Array): ValidatedGrib {
  const analyzed = analyzeGribForApp(bytes);
  const { messages, fields, pressureField, windUField, windVField, diagnostics } = analyzed;
  if (!pressureField) fail('UNSUPPORTED_VERTICAL_LEVEL', 'Mean sea-level pressure is missing or unsupported');
  return {
    messages,
    fields,
    pressure: pressureField.message,
    pressureField,
    windU: windUField?.message,
    windV: windVField?.message,
    windUField,
    windVField,
    grid: pressureField.grid,
    diagnostics,
  };
}

export interface IsobareLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function chooseAmbiguousContourConnection(
  a: number,
  b: number,
  c: number,
  d: number,
  level: number
): boolean {
  if (![a, b, c, d, level].every(Number.isFinite)) {
    fail('NON_FINITE_VALUE', 'Non-finite value in contour cell');
  }
  return (a + b + c + d) / 4 > level;
}

export function computeIsobares(
  values: Float32Array,
  ni: number,
  nj: number,
  levels: number[]
): Map<number, IsobareLine[]> {
  if (values.length !== ni * nj || !Array.from(values).every(Number.isFinite) || !levels.every(Number.isFinite)) {
    fail('NON_FINITE_VALUE', 'Invalid pressure values for isobars');
  }
  const result = new Map<number, IsobareLine[]>();
  for (const level of levels) {
    const lines: IsobareLine[] = [];
    for (let j = 0; j < nj - 1; j++) {
      for (let i = 0; i < ni - 1; i++) {
        const a = values[j * ni + i];
        const b = values[j * ni + i + 1];
        const c = values[(j + 1) * ni + i + 1];
        const d = values[(j + 1) * ni + i];
        const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) |
          (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const top = a === b ? 0.5 : (level - a) / (b - a);
        const right = b === c ? 0.5 : (level - b) / (c - b);
        const bottom = d === c ? 0.5 : (level - d) / (c - d);
        const left = a === d ? 0.5 : (level - a) / (d - a);
        const T = { x: i + top, y: j };
        const R = { x: i + 1, y: j + right };
        const B = { x: i + bottom, y: j + 1 };
        const L = { x: i, y: j + left };
        const push = (one: typeof T, two: typeof T) =>
          lines.push({ x1: one.x, y1: one.y, x2: two.x, y2: two.y });
        switch (code) {
          case 1: push(L, B); break;
          case 2: push(B, R); break;
          case 3: push(L, R); break;
          case 4: push(T, R); break;
          case 5:
            if (chooseAmbiguousContourConnection(a, b, c, d, level)) { push(T, R); push(L, B); }
            else { push(T, B); push(L, R); }
            break;
          case 6: push(T, B); break;
          case 7: push(T, L); break;
          case 8: push(T, L); break;
          case 9: push(T, B); break;
          case 10:
            if (chooseAmbiguousContourConnection(a, b, c, d, level)) { push(T, B); push(L, R); }
            else { push(T, R); push(L, B); }
            break;
          case 11: push(T, R); break;
          case 12: push(L, R); break;
          case 13: push(B, R); break;
          case 14: push(L, B); break;
        }
      }
    }
    result.set(level, lines);
  }
  return result;
}
