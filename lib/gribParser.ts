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
  template: 0 | 3;
  numberOfValues: number;
  referenceValue: number;
  binaryScale: number;
  decimalScale: number;
  bitsPerValue: number;
  groupSplittingMethod?: number;
  missingValueManagement?: number;
  numberOfGroups?: number;
  groupWidthReference?: number;
  groupWidthBits?: number;
  groupLengthReference?: number;
  groupLengthIncrement?: number;
  lastGroupLength?: number;
  groupLengthBits?: number;
  spatialDifferencingOrder?: number;
  spatialDescriptorOctets?: number;
}

export function readDataRepresentation(bytes: Uint8Array, messageOffset: number): GribDataRepresentation {
  const message = structureAt(bytes, messageOffset);
  const section = message.sections.get(5)!;
  if (section.size < 21) fail('INVALID_STRUCTURE', 'Incomplete GRIB section 5');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const template = view.getUint16(section.offset + 9, false);
  if (template !== 0 && template !== 3) fail('UNSUPPORTED_PACKING', `Unsupported GRIB packing (${template})`);
  const referenceValue = assertFinite(view.getFloat32(section.offset + 11, false), 'reference value');
  const common = {
    template,
    numberOfValues: view.getUint32(section.offset + 5, false),
    referenceValue,
    binaryScale: signedMagnitude16(view, section.offset + 15),
    decimalScale: signedMagnitude16(view, section.offset + 17),
    bitsPerValue: view.getUint8(section.offset + 19),
  };
  if (template === 0) return { ...common, template: 0 };
  if (section.size < 49) fail('INVALID_STRUCTURE', 'Incomplete GRIB complex packing template');
  const groupSplittingMethod = view.getUint8(section.offset + 21);
  const missingValueManagement = view.getUint8(section.offset + 22);
  const spatialDifferencingOrder = view.getUint8(section.offset + 47);
  const spatialDescriptorOctets = view.getUint8(section.offset + 48);
  if (groupSplittingMethod !== 1) {
    fail('UNSUPPORTED_PACKING', `Unsupported GRIB group splitting method (${groupSplittingMethod})`);
  }
  if (missingValueManagement !== 0) {
    fail('UNSUPPORTED_PACKING', `Unsupported GRIB missing value management (${missingValueManagement})`);
  }
  if (spatialDifferencingOrder !== 1 && spatialDifferencingOrder !== 2) {
    fail('UNSUPPORTED_PACKING', `Unsupported GRIB spatial differencing order (${spatialDifferencingOrder})`);
  }
  if (spatialDescriptorOctets < 1 || spatialDescriptorOctets > 4) {
    fail('UNSUPPORTED_PACKING', `Unsupported GRIB spatial descriptor width (${spatialDescriptorOctets})`);
  }
  return {
    ...common,
    template: 3,
    groupSplittingMethod,
    missingValueManagement,
    numberOfGroups: view.getUint32(section.offset + 31, false),
    groupWidthReference: view.getUint8(section.offset + 35),
    groupWidthBits: view.getUint8(section.offset + 36),
    groupLengthReference: view.getUint32(section.offset + 37, false),
    groupLengthIncrement: view.getUint8(section.offset + 41),
    lastGroupLength: view.getUint32(section.offset + 42, false),
    groupLengthBits: view.getUint8(section.offset + 46),
    spatialDifferencingOrder,
    spatialDescriptorOctets,
  };
}

class BitReader {
  private bitOffset = 0;

  constructor(
    private readonly view: DataView,
    private readonly byteOffset: number,
    private readonly byteLength: number
  ) {}

  read(bits: number): number {
    if (bits < 0 || bits > 31) fail('UNSUPPORTED_BIT_DEPTH', `Unsupported GRIB bit depth (${bits} bits)`);
    if (this.bitOffset + bits > this.byteLength * 8) fail('INVALID_STRUCTURE', 'GRIB packed data is truncated');
    let value = 0;
    for (let bit = 0; bit < bits; bit++) {
      const absoluteBit = this.bitOffset++;
      const byte = this.view.getUint8(this.byteOffset + Math.floor(absoluteBit / 8));
      value = value * 2 + ((byte >> (7 - absoluteBit % 8)) & 1);
    }
    return value;
  }

  alignToByte() {
    this.bitOffset = Math.ceil(this.bitOffset / 8) * 8;
  }

  get consumedBits() {
    return this.bitOffset;
  }
}

function readSignedMagnitudeBytes(view: DataView, offset: number, octets: number): number {
  let encoded = 0;
  for (let index = 0; index < octets; index++) encoded = encoded * 256 + view.getUint8(offset + index);
  const signThreshold = 2 ** (octets * 8 - 1);
  return encoded >= signThreshold ? -(encoded - signThreshold) : encoded;
}

async function decodeComplexSpatialValues(
  view: DataView,
  dataOffset: number,
  dataLength: number,
  representation: GribDataRepresentation
): Promise<Float32Array> {
  const {
    numberOfValues, referenceValue, binaryScale, decimalScale, bitsPerValue,
    numberOfGroups = 0, groupWidthReference = 0, groupWidthBits = 0,
    groupLengthReference = 0, groupLengthIncrement = 0, lastGroupLength = 0,
    groupLengthBits = 0, spatialDifferencingOrder = 0, spatialDescriptorOctets = 0,
  } = representation;
  if (numberOfValues < spatialDifferencingOrder) {
    fail('INVALID_STRUCTURE', 'GRIB spatial differencing order exceeds the value count');
  }
  if (numberOfGroups < 1 || numberOfGroups > numberOfValues) {
    fail('INVALID_STRUCTURE', 'Invalid GRIB complex packing group count');
  }
  const descriptorCount = spatialDifferencingOrder + 1;
  const descriptorBytes = descriptorCount * spatialDescriptorOctets;
  if (descriptorBytes > dataLength) fail('INVALID_STRUCTURE', 'Incomplete GRIB spatial differencing descriptors');
  const descriptors = Array.from({ length: descriptorCount }, (_, index) =>
    readSignedMagnitudeBytes(view, dataOffset + index * spatialDescriptorOctets, spatialDescriptorOctets)
  );
  const reader = new BitReader(view, dataOffset + descriptorBytes, dataLength - descriptorBytes);
  const groupReferences = Array.from({ length: numberOfGroups }, () => reader.read(bitsPerValue));
  reader.alignToByte();
  const groupWidths = Array.from({ length: numberOfGroups }, () =>
    groupWidthReference + reader.read(groupWidthBits)
  );
  reader.alignToByte();
  const groupLengths = Array.from({ length: numberOfGroups }, (_, index) =>
    index === numberOfGroups - 1
      ? lastGroupLength
      : groupLengthReference + reader.read(groupLengthBits) * groupLengthIncrement
  );
  if (numberOfGroups > 0 && groupLengthBits > 0) reader.read(groupLengthBits);
  reader.alignToByte();
  const packed = new Float64Array(numberOfValues);
  let valueIndex = 0;
  for (let group = 0; group < numberOfGroups; group++) {
    const width = groupWidths[group];
    for (let index = 0; index < groupLengths[group]; index++) {
      if (valueIndex >= numberOfValues) fail('INVALID_STRUCTURE', 'GRIB complex groups exceed the declared value count');
      packed[valueIndex++] = groupReferences[group] + reader.read(width);
    }
    if (group % 128 === 127) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (valueIndex !== numberOfValues) fail('INVALID_STRUCTURE', 'GRIB complex groups do not match the declared value count');
  if (reader.consumedBits > (dataLength - descriptorBytes) * 8) fail('INVALID_STRUCTURE', 'GRIB complex data exceeds section 7');

  const minimumDifference = descriptors[spatialDifferencingOrder];
  const integers = new Float64Array(numberOfValues);
  if (spatialDifferencingOrder === 1) {
    integers[0] = descriptors[0];
    for (let index = 1; index < numberOfValues; index++) {
      integers[index] = integers[index - 1] + packed[index] + minimumDifference;
    }
  } else {
    integers[0] = descriptors[0];
    integers[1] = descriptors[1];
    for (let index = 2; index < numberOfValues; index++) {
      integers[index] = 2 * integers[index - 1] - integers[index - 2] + packed[index] + minimumDifference;
    }
  }

  const binaryMultiplier = assertFinite(2 ** binaryScale, 'binary scale');
  const decimalDivisor = assertFinite(10 ** decimalScale, 'decimal scale');
  if (decimalDivisor === 0) fail('NON_FINITE_VALUE', 'Invalid GRIB decimal scale');
  const values = new Float32Array(numberOfValues);
  for (let index = 0; index < numberOfValues; index++) {
    values[index] = assertFinite((referenceValue + integers[index] * binaryMultiplier) / decimalDivisor, `decoded value ${index}`);
  }
  return values;
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
  if (representation.template === 3) {
    return decodeComplexSpatialValues(view, section.offset + 5, section.size - 5, representation);
  }
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

export type GribCompatibilityIssueCategory =
  | 'edition'
  | 'grid-template'
  | 'product-template'
  | 'data-template'
  | 'scanning-mode'
  | 'bitmap'
  | 'level'
  | 'variable'
  | 'malformed-data';

export interface GribCompatibilityIssue {
  category: GribCompatibilityIssueCategory;
  code?: number | string;
  message: string;
  messageIndex?: number;
  section?: number;
  variable?: string;
  level?: string;
}

export type GribImportStatus = 'supported' | 'partially-supported' | 'unsupported';

export interface GribMessageTechnicalDetails {
  messageIndex: number;
  edition: number;
  centre?: number;
  gridTemplate?: number;
  productTemplate?: number;
  dataTemplate?: number;
  scanningMode?: number;
  bitmapIndicator?: number;
  variable?: string;
  level?: string;
}

export interface GribCompatibilityReport {
  status: GribImportStatus;
  availableLayers: Array<'pressure' | 'wind'>;
  issues: GribCompatibilityIssue[];
  messages: GribMessageTechnicalDetails[];
}

function parameterLabel(discipline: number, category: number, parameter: number): string {
  if (discipline === 0 && category === 3 && parameter === 1) return 'Mean sea level pressure';
  if (discipline === 0 && category === 2 && parameter === 2) return 'U wind component';
  if (discipline === 0 && category === 2 && parameter === 3) return 'V wind component';
  if (discipline === 0 && category === 1 && parameter === 8) return 'Total precipitation';
  if (discipline === 10 && category === 0 && parameter === 3) return 'Significant wave height';
  return `Discipline ${discipline}, category ${category}, parameter ${parameter}`;
}

function surfaceLabel(type: number, scaleFactor: number, scaledValue: number): string {
  const value = scaledValue * 10 ** -scaleFactor;
  if (type === 101) return 'mean sea level';
  if (type === 103) return `${value} m above ground`;
  if (type === 100) return `${value} Pa isobaric surface`;
  return `surface type ${type}, value ${value}`;
}

function compatibilityIssue(
  issue: Omit<GribCompatibilityIssue, 'messageIndex'>,
  messageIndex: number
): GribCompatibilityIssue {
  return { ...issue, messageIndex };
}

function compatibilityCategoryForError(error: GribValidationError): {
  category: GribCompatibilityIssueCategory;
  section?: number;
} {
  if (error.code === 'UNSUPPORTED_PRODUCT_TEMPLATE') return { category: 'product-template', section: 4 };
  if (error.code === 'UNSUPPORTED_PACKING' || error.code === 'UNSUPPORTED_BIT_DEPTH') {
    return { category: 'data-template', section: 5 };
  }
  if (error.code === 'UNSUPPORTED_BITMAP') return { category: 'bitmap', section: 6 };
  if (error.code === 'UNSUPPORTED_SCANNING_MODE') return { category: 'scanning-mode', section: 3 };
  if (
    error.code === 'UNSUPPORTED_GRID_TEMPLATE' ||
    error.code === 'UNSUPPORTED_QUASI_REGULAR_GRID' ||
    error.code === 'UNSUPPORTED_ANTIMERIDIAN_GRID'
  ) return { category: 'grid-template', section: 3 };
  if (error.code === 'UNSUPPORTED_VERTICAL_LEVEL') return { category: 'level', section: 4 };
  return { category: 'malformed-data' };
}

function scanGribCandidateOffsets(bytes: Uint8Array): number[] {
  const offsets: number[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    if (
      bytes[offset] === 0x47 && bytes[offset + 1] === 0x52 &&
      bytes[offset + 2] === 0x49 && bytes[offset + 3] === 0x42
    ) {
      offsets.push(offset);
      const edition = bytes[offset + 7];
      if (edition === 2 && offset + 16 <= bytes.length && view.getUint32(offset + 8, false) === 0) {
        const size = view.getUint32(offset + 12, false);
        if (
          size >= 20 && offset + size <= bytes.length &&
          bytes[offset + size - 4] === 0x37 && bytes[offset + size - 3] === 0x37 &&
          bytes[offset + size - 2] === 0x37 && bytes[offset + size - 1] === 0x37
        ) {
          offset += size;
          continue;
        }
      } else if (edition === 1) {
        const size = bytes[offset + 4] * 65536 + bytes[offset + 5] * 256 + bytes[offset + 6];
        if (size >= 12 && offset + size <= bytes.length) {
          offset += size;
          continue;
        }
      }
      offset += 4;
      continue;
    }
    offset++;
  }
  return offsets;
}

/**
 * Inventories every GRIB marker independently. This function never attempts to
 * reinterpret unsupported encodings: a message is either accepted by the strict
 * parser or described as an explicit compatibility issue.
 */
export function inspectGribCompatibility(bytes: Uint8Array): GribCompatibilityReport {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsets = scanGribCandidateOffsets(bytes);
  const issues: GribCompatibilityIssue[] = [];
  const messages: GribMessageTechnicalDetails[] = [];
  const usableFields: ParsedGribField[] = [];

  if (offsets.length === 0) {
    issues.push({ category: 'malformed-data', message: 'No GRIB message marker found' });
  }

  offsets.forEach((offset, messageIndex) => {
    const edition = view.getUint8(offset + 7);
    const details: GribMessageTechnicalDetails = { messageIndex, edition };
    messages.push(details);
    if (edition !== 2) {
      issues.push(compatibilityIssue({
        category: 'edition', code: edition, message: `Unsupported GRIB edition ${edition}`,
      }, messageIndex));
      return;
    }

    let structure: ParsedMessageStructure;
    try {
      structure = parseMessageStructure(bytes, offset);
    } catch (error) {
      issues.push(compatibilityIssue({
        category: 'malformed-data',
        code: error instanceof GribValidationError ? error.code : undefined,
        message: error instanceof Error ? error.message : 'Malformed GRIB message',
      }, messageIndex));
      return;
    }

    const section1 = structure.sections.get(1)!;
    const section3 = structure.sections.get(3)!;
    const section4 = structure.sections.get(4)!;
    const section5 = structure.sections.get(5)!;
    const section6 = structure.sections.get(6)!;
    details.centre = view.getUint16(section1.offset + 5, false);
    details.gridTemplate = view.getUint16(section3.offset + 12, false);
    details.productTemplate = view.getUint16(section4.offset + 7, false);
    details.dataTemplate = view.getUint16(section5.offset + 9, false);
    details.bitmapIndicator = view.getUint8(section6.offset + 5);
    if (section4.size < 34) {
      issues.push(compatibilityIssue({
        category: 'malformed-data', code: 'INCOMPLETE_PRODUCT_DEFINITION', section: 4,
        message: 'Incomplete GRIB product definition',
      }, messageIndex));
      return;
    }
    if (details.gridTemplate === 0 && section3.size >= 72) {
      details.scanningMode = view.getUint8(section3.offset + 71);
    }
    const discipline = structure.discipline;
    const category = view.getUint8(section4.offset + 9);
    const parameter = view.getUint8(section4.offset + 10);
    details.variable = parameterLabel(discipline, category, parameter);
    if (section4.size >= 34) {
      details.level = surfaceLabel(
        view.getUint8(section4.offset + 22),
        signedMagnitude8(view.getUint8(section4.offset + 23)),
        signedMagnitude32(view, section4.offset + 24)
      );
    }

    let incompatible = false;
    if (details.gridTemplate !== 0) {
      incompatible = true;
      const suffix = details.gridTemplate === 30 ? ' (Lambert conformal)' : '';
      issues.push(compatibilityIssue({
        category: 'grid-template', code: details.gridTemplate, section: 3,
        message: `Unsupported grid template 3.${details.gridTemplate}${suffix}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }
    if (details.productTemplate !== 0) {
      incompatible = true;
      issues.push(compatibilityIssue({
        category: 'product-template', code: details.productTemplate, section: 4,
        message: `Unsupported product template 4.${details.productTemplate}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }
    if (details.dataTemplate !== 0 && details.dataTemplate !== 3) {
      incompatible = true;
      const suffix = details.dataTemplate === 41 ? ' (PNG)' :
        details.dataTemplate === 40 || details.dataTemplate === 40000 ? ' (JPEG2000)' : '';
      issues.push(compatibilityIssue({
        category: 'data-template', code: details.dataTemplate, section: 5,
        message: `Unsupported GRIB data packing template 5.${details.dataTemplate}${suffix}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }
    if (details.scanningMode !== undefined && details.scanningMode !== 64) {
      incompatible = true;
      issues.push(compatibilityIssue({
        category: 'scanning-mode', code: details.scanningMode, section: 3,
        message: `Unsupported scanning mode ${details.scanningMode}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }
    if (details.bitmapIndicator !== 255) {
      incompatible = true;
      issues.push(compatibilityIssue({
        category: 'bitmap', code: details.bitmapIndicator, section: 6,
        message: `Unsupported bitmap indicator ${details.bitmapIndicator}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }

    const isPressureVariable = discipline === 0 && category === 3 && parameter === 1;
    const isWindVariable = discipline === 0 && category === 2 && (parameter === 2 || parameter === 3);
    const surfaceType = view.getUint8(section4.offset + 22);
    const surfaceScale = signedMagnitude8(view.getUint8(section4.offset + 23));
    const surfaceValue = signedMagnitude32(view, section4.offset + 24);
    const supportedLevel = (isPressureVariable && surfaceType === 101) ||
      (isWindVariable && surfaceType === 103 && surfaceScale === 0 && surfaceValue === 10);
    if ((isPressureVariable || isWindVariable) && !supportedLevel) {
      incompatible = true;
      issues.push(compatibilityIssue({
        category: 'level', code: surfaceType,
        message: `Unsupported level: ${details.level}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    } else if (!isPressureVariable && !isWindVariable) {
      incompatible = true;
      issues.push(compatibilityIssue({
        category: 'variable', code: `${discipline}/${category}/${parameter}`,
        message: `Unsupported parameter: ${details.variable}`,
        variable: details.variable, level: details.level,
      }, messageIndex));
    }

    if (incompatible) return;
    try {
      const identity = readFieldIdentity(bytes, offset);
      const grid = readGridDefinition(bytes, offset);
      const representation = readDataRepresentation(bytes, offset);
      if (representation.numberOfValues !== grid.ni * grid.nj) {
        fail('INVALID_GRID_GEOMETRY', 'Inconsistent GRIB data point count');
      }
      usableFields.push({ message: structure, identity, grid, representation });
    } catch (error) {
      const classified = error instanceof GribValidationError
        ? compatibilityCategoryForError(error)
        : { category: 'malformed-data' as const };
      issues.push(compatibilityIssue({
        category: classified.category,
        code: error instanceof GribValidationError ? error.code : undefined,
        section: classified.section,
        message: error instanceof Error ? error.message : 'Malformed GRIB message',
        variable: details.variable, level: details.level,
      }, messageIndex));
    }
  });

  const pressure = usableFields.some(field => isMeanSeaLevelPressureField(field.identity));
  const windUFields = usableFields.filter(field =>
    isTenMeterWindField(field.identity) && field.identity.parameter === 2
  );
  const windVFields = usableFields.filter(field =>
    isTenMeterWindField(field.identity) && field.identity.parameter === 3
  );
  const hasWindPair = windUFields.some(u =>
    windVFields.some(v => buildFieldMatchKey(u) === buildFieldMatchKey(v))
  );
  const availableLayers: GribCompatibilityReport['availableLayers'] = [
    ...(pressure ? ['pressure' as const] : []),
    ...(hasWindPair ? ['wind' as const] : []),
  ];
  const status: GribImportStatus = availableLayers.length === 0
    ? 'unsupported'
    : issues.length > 0
      ? 'partially-supported'
      : 'supported';
  return { status, availableLayers, issues, messages };
}

export function formatGribTechnicalDetails(report: GribCompatibilityReport): string {
  const lines = [
    `GRIB import status: ${report.status}`,
    `Available layers: ${report.availableLayers.length ? report.availableLayers.join(', ') : 'none'}`,
    '',
    'Messages:',
  ];
  for (const message of report.messages) {
    lines.push(
      `#${message.messageIndex}: edition=${message.edition}` +
      ` centre=${message.centre ?? 'unknown'}` +
      ` grid=${message.gridTemplate === undefined ? 'unknown' : `3.${message.gridTemplate}`}` +
      ` product=${message.productTemplate === undefined ? 'unknown' : `4.${message.productTemplate}`}` +
      ` packing=${message.dataTemplate === undefined ? 'unknown' : `5.${message.dataTemplate}`}` +
      ` scanning=${message.scanningMode ?? 'unknown'}` +
      ` bitmap=${message.bitmapIndicator ?? 'unknown'}` +
      ` variable=${message.variable ?? 'unknown'}` +
      ` level=${message.level ?? 'unknown'}`
    );
  }
  if (report.issues.length) {
    lines.push('', 'Ignored messages:');
    report.issues.forEach(issue => {
      lines.push(
        `#${issue.messageIndex ?? 'unknown'} [${issue.category}] ${issue.message}` +
        `${issue.section === undefined ? '' : `; section=${issue.section}`}`
      );
    });
  }
  return lines.join('\n');
}

export interface AnalyzedGrib {
  messages: GribMessage[];
  fields: ParsedGribField[];
  pressureField?: ParsedGribField;
  windUField?: ParsedGribField;
  windVField?: ParsedGribField;
  diagnostics: GribLayerDiagnostic[];
}

export function analyzeGribForApp(bytes: Uint8Array, messageIndexes?: number[]): AnalyzedGrib {
  const allMessages = findGribMessages(bytes);
  const messages = messageIndexes
    ? messageIndexes.map(index => {
        const message = allMessages[index];
        if (!message) fail('INVALID_STRUCTURE', `GRIB message index ${index} is unavailable`);
        return message;
      })
    : allMessages;
  if (messages.length === 0) fail('INVALID_STRUCTURE', 'No valid GRIB2 message');
  const diagnostics: GribLayerDiagnostic[] = [];
  const fields: ParsedGribField[] = [];
  for (const message of messages) {
    let identity: GribFieldIdentity;
    try {
      identity = readFieldIdentity(bytes, message.offset);
    } catch (error) {
      if (error instanceof GribValidationError && error.code === 'UNSUPPORTED_PRODUCT_TEMPLATE') {
        diagnostics.push({
          layer: 'frame', severity: 'info', code: 'UNSUPPORTED_FIELD',
          message: error.message,
        });
        continue;
      }
      throw error;
    }
    const grid = readGridDefinition(bytes, message.offset);
    const representation = readDataRepresentation(bytes, message.offset);
    if (readBitmapIndicator(bytes, message.offset) !== 255) {
      fail('UNSUPPORTED_BITMAP', 'GRIB bitmaps are not supported');
    }
    if (representation.numberOfValues !== grid.ni * grid.nj) {
      fail('INVALID_GRID_GEOMETRY', 'Inconsistent GRIB data point count');
    }
    if (representation.template === 0) {
      const section7 = structureAt(bytes, message.offset).sections.get(7)!;
      if (section7.size !== 5 + Math.ceil(representation.numberOfValues * representation.bitsPerValue / 8)) {
        fail('INVALID_STRUCTURE', 'Inconsistent GRIB packed data length');
      }
    }
    fields.push({ message, identity, grid, representation });
  }
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

export interface AnalyzedForecastGroup extends AnalyzedGrib {
  referenceTime: string;
  forecastTime: number;
  forecastTimeUnit: number;
  messageIndexes: number[];
}

export function analyzeGribFramesForApp(bytes: Uint8Array): AnalyzedForecastGroup[] {
  const allMessages = findGribMessages(bytes);
  const relevant: ParsedGribField[] = [];
  for (const message of allMessages) {
    try {
      const identity = readFieldIdentity(bytes, message.offset);
      if (!isMeanSeaLevelPressureField(identity) && !isTenMeterWindField(identity)) continue;
      const grid = readGridDefinition(bytes, message.offset);
      const representation = readDataRepresentation(bytes, message.offset);
      if (readBitmapIndicator(bytes, message.offset) !== 255) continue;
      if (representation.numberOfValues !== grid.ni * grid.nj) continue;
      relevant.push({ message, identity, grid, representation });
    } catch (error) {
      if (error instanceof GribValidationError) continue;
      throw error;
    }
  }
  const groups = new Map<string, ParsedGribField[]>();
  for (const field of relevant) {
    const { referenceTime, forecastTime, forecastTimeUnit } = field.identity;
    const key = `${referenceTime}/${forecastTimeUnit}/${forecastTime}`;
    const group = groups.get(key);
    if (group) group.push(field);
    else groups.set(key, [field]);
  }

  return Array.from(groups.values()).map(fields => {
    const first = fields[0];
    const messageIndexes = fields.map(field => {
      const index = allMessages.findIndex(message => message.offset === field.message.offset);
      if (index < 0) fail('INVALID_STRUCTURE', 'GRIB field message cannot be indexed');
      return index;
    });
    const frame = analyzeGribForApp(bytes, messageIndexes);
    return {
      ...frame,
      referenceTime: first.identity.referenceTime,
      forecastTime: first.identity.forecastTime,
      forecastTimeUnit: first.identity.forecastTimeUnit,
      messageIndexes,
    };
  }).sort((left, right) =>
    Date.parse(left.referenceTime) - Date.parse(right.referenceTime)
    || left.forecastTime - right.forecastTime
  );
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
