/**
 * Banco de modelos 3D de B10 (§4.6, §4.7, §6.5, §6.6). Datos puros: qué región existe en cada modelo, qué parte anatómica es y
 * desde qué lado se ve. La geometría (`engine/anatomy`) dibuja exactamente estas regiones; si un modelo no declara una región,
 * no se evalúa (§3.8). `facing` es el vector unitario hacia el que mira la región, en ejes del modelo: +x cabeza o rostro,
 * +y dorso, +z lado izquierdo del animal. `null` significa que se ve desde cualquier orientación.
 */
export type ModelGroup = 'invertebrate' | 'vertebrate' | 'bird' | 'skull' | 'track';

export type AnatomyPart =
  // Invertebrados.
  | 'auricle' | 'ocellus' | 'pharynx' | 'oralSucker' | 'ventralSucker' | 'tegument' | 'anteriorEnd' | 'posteriorEnd' | 'cuticle' | 'scolex' | 'neck' | 'proglottid'
  | 'prostomium' | 'segment' | 'clitellum' | 'head' | 'thorax' | 'abdomen' | 'antenna' | 'wing' | 'leg' | 'proboscis' | 'cephalothorax' | 'chelicera' | 'pedipalp'
  | 'prosoma' | 'mesosoma' | 'metasoma' | 'sting' | 'compactBody' | 'eyeTubercle'
  // Vertebrados.
  | 'operculum' | 'dorsalFin' | 'caudalFin' | 'pectoralFin' | 'lateralLine' | 'mouth' | 'eye' | 'gillSlit' | 'spiracle' | 'snout' | 'heterocercalTail' | 'trunk' | 'forelimb' | 'hindlimb' | 'tympanum'
  | 'scales' | 'tail' | 'beak' | 'feathers' | 'tarsus' | 'pectoralRegion' | 'pinna' | 'fur'
  // Cráneo y dentición.
  | 'incisor' | 'canine' | 'premolar' | 'molar' | 'diastema' | 'tusk' | 'dentalPad' | 'orbit' | 'zygomaticArch' | 'foramenMagnum' | 'occipital' | 'maxilla' | 'premaxilla' | 'mandible' | 'hornCore' | 'sagittalCrest'
  // Huellas.
  | 'hoofPrint' | 'cleftBetweenDigits' | 'digitPad' | 'metacarpalPad' | 'clawMark' | 'hallux';

export type BeakType = 'seed' | 'hook' | 'filter' | 'nectar' | 'probe';
export type FootType = 'perching' | 'webbed' | 'raptorial' | 'wading' | 'cursorial';
export type SkullDiet = 'grazer' | 'ruminant' | 'carnivore' | 'omnivore';
export type TrackSupport = 'unguligrade' | 'digitigrade' | 'plantigrade' | 'avian';

export interface AnatomyRegion {
  id: string;
  part: AnatomyPart;
  facing: [number, number, number] | null;
}

export interface AnatomyModel {
  id: string;
  group: ModelGroup;
  /** Grupo zoológico (§3.2) o, en huellas y cráneos, el animal de referencia. */
  taxon: string;
  regions: AnatomyRegion[];
  /** Tipo funcional que el modelo muestra con claridad; ausente = no se evalúa (§3.6). */
  beak?: BeakType;
  foot?: FootType;
  diet?: SkullDiet;
  track?: { digits: number; support: TrackSupport; claws: boolean };
}

const L: [number, number, number] = [0, 0, 1];
const UP: [number, number, number] = [0, 1, 0];
const DOWN: [number, number, number] = [0, -1, 0];
const FRONT: [number, number, number] = [1, 0, 0];
const BACK: [number, number, number] = [-1, 0, 0];

const R = (id: string, part: AnatomyPart, facing: [number, number, number] | null = null): AnatomyRegion => ({ id, part, facing });

/** Regiones de un ave: iguales en todas las variantes; cambian el pico y la pata. */
const BIRD: AnatomyRegion[] = [R('a', 'beak', L), R('b', 'wing', L), R('c', 'tail', L), R('d', 'tarsus', L), R('e', 'pectoralRegion', FRONT), R('f', 'feathers', UP)];

export const ANATOMY_MODELS: AnatomyModel[] = [
  // Platelmintos, nematodos y anélidos. Se miran por el dorso; las ventosas y la faringe, por el vientre.
  { id: 'planaria', group: 'invertebrate', taxon: 'platyhelminthes', regions: [R('a', 'auricle', UP), R('b', 'ocellus', UP), R('c', 'pharynx', DOWN), R('d', 'tegument', UP)] },
  { id: 'fluke', group: 'invertebrate', taxon: 'platyhelminthes', regions: [R('a', 'oralSucker', DOWN), R('b', 'ventralSucker', DOWN), R('c', 'tegument', UP)] },
  { id: 'nematode', group: 'invertebrate', taxon: 'nematoda', regions: [R('a', 'anteriorEnd'), R('b', 'posteriorEnd'), R('c', 'cuticle')] },
  { id: 'cestode', group: 'invertebrate', taxon: 'platyhelminthes', regions: [R('a', 'scolex'), R('b', 'neck'), R('c', 'proglottid')] },
  { id: 'earthworm', group: 'invertebrate', taxon: 'annelida', regions: [R('a', 'prostomium'), R('b', 'segment'), R('c', 'clitellum')] },
  // Artrópodos.
  { id: 'grasshopper', group: 'invertebrate', taxon: 'insecta', regions: [R('a', 'head', L), R('b', 'thorax', L), R('c', 'abdomen', L), R('d', 'antenna', L), R('e', 'wing', UP), R('f', 'leg', L)] },
  { id: 'butterfly', group: 'invertebrate', taxon: 'insecta', regions: [R('a', 'proboscis', DOWN), R('b', 'wing', UP), R('c', 'antenna', UP), R('d', 'head', UP), R('e', 'thorax', UP), R('f', 'abdomen', UP), R('g', 'leg', DOWN)] },
  { id: 'spider', group: 'invertebrate', taxon: 'arachnida', regions: [R('a', 'cephalothorax', UP), R('b', 'abdomen', UP), R('c', 'chelicera', FRONT), R('d', 'pedipalp', FRONT), R('e', 'leg', UP)] },
  { id: 'scorpion', group: 'invertebrate', taxon: 'arachnida', regions: [R('a', 'prosoma', UP), R('b', 'mesosoma', UP), R('c', 'metasoma', L), R('d', 'pedipalp', UP), R('e', 'sting', L)] },
  { id: 'opilion', group: 'invertebrate', taxon: 'arachnida', regions: [R('a', 'compactBody', UP), R('b', 'leg', UP), R('c', 'eyeTubercle', UP)] },
  // Vertebrados.
  { id: 'boneFish', group: 'vertebrate', taxon: 'osteichthyes', regions: [R('a', 'operculum', L), R('b', 'dorsalFin', UP), R('c', 'caudalFin', L), R('d', 'pectoralFin', L), R('e', 'lateralLine', L), R('f', 'mouth', FRONT), R('g', 'eye', L)] },
  { id: 'cartFish', group: 'vertebrate', taxon: 'chondrichthyes', regions: [R('a', 'gillSlit', L), R('b', 'dorsalFin', UP), R('c', 'heterocercalTail', L), R('d', 'pectoralFin', L), R('e', 'spiracle', L), R('f', 'snout', FRONT)] },
  { id: 'frog', group: 'vertebrate', taxon: 'amphibia', regions: [R('a', 'head', L), R('b', 'trunk', L), R('c', 'forelimb', L), R('d', 'hindlimb', L), R('e', 'tympanum', L)] },
  { id: 'lizard', group: 'vertebrate', taxon: 'reptilia', regions: [R('a', 'head', L), R('b', 'scales', UP), R('c', 'trunk', L), R('d', 'tail', L), R('e', 'forelimb', L)] },
  { id: 'mammal', group: 'vertebrate', taxon: 'mammalia', regions: [R('a', 'pinna', L), R('b', 'forelimb', L), R('c', 'hindlimb', L), R('d', 'thorax', L), R('e', 'fur', UP), R('f', 'head', L)] },
  // Aves: la forma manda; la identificación es funcional y nunca de especie (§3.6).
  { id: 'birdFinch', group: 'bird', taxon: 'aves', regions: BIRD, beak: 'seed', foot: 'perching' },
  { id: 'birdRaptor', group: 'bird', taxon: 'aves', regions: BIRD, beak: 'hook', foot: 'raptorial' },
  { id: 'birdDuck', group: 'bird', taxon: 'aves', regions: BIRD, beak: 'filter', foot: 'webbed' },
  { id: 'birdHummingbird', group: 'bird', taxon: 'aves', regions: BIRD, beak: 'nectar', foot: 'perching' },
  { id: 'birdWader', group: 'bird', taxon: 'aves', regions: BIRD, beak: 'probe', foot: 'wading' },
  { id: 'birdRunner', group: 'bird', taxon: 'aves', regions: BIRD, foot: 'cursorial' },
  // Cráneos: +x rostro. El foramen magno solo se ve por detrás o por abajo; la dentición, de lado.
  {
    id: 'skullHorse', group: 'skull', taxon: 'horse', diet: 'grazer',
    regions: [R('a', 'incisor', FRONT), R('b', 'canine', L), R('c', 'diastema', L), R('d', 'premolar', L), R('e', 'molar', L), R('f', 'orbit', L), R('g', 'zygomaticArch', L), R('h', 'foramenMagnum', BACK), R('i', 'occipital', BACK), R('j', 'maxilla', L), R('k', 'premaxilla', L), R('l', 'mandible', L)],
  },
  {
    id: 'skullCow', group: 'skull', taxon: 'cow', diet: 'ruminant',
    regions: [R('a', 'dentalPad', DOWN), R('b', 'incisor', FRONT), R('c', 'diastema', L), R('d', 'premolar', L), R('e', 'molar', L), R('f', 'orbit', L), R('g', 'hornCore', UP), R('h', 'foramenMagnum', BACK), R('i', 'occipital', BACK), R('j', 'maxilla', L), R('k', 'premaxilla', L), R('l', 'mandible', L)],
  },
  {
    id: 'skullDog', group: 'skull', taxon: 'carnivore', diet: 'carnivore',
    regions: [R('a', 'incisor', FRONT), R('b', 'canine', L), R('c', 'premolar', L), R('d', 'molar', L), R('e', 'orbit', L), R('f', 'zygomaticArch', L), R('g', 'sagittalCrest', UP), R('h', 'foramenMagnum', BACK), R('i', 'mandible', L)],
  },
  {
    id: 'skullPig', group: 'skull', taxon: 'omnivore', diet: 'omnivore',
    regions: [R('a', 'incisor', FRONT), R('b', 'tusk', L), R('c', 'premolar', L), R('d', 'molar', L), R('e', 'orbit', L), R('f', 'zygomaticArch', L), R('g', 'foramenMagnum', BACK), R('h', 'mandible', L)],
  },
  // Huellas: se miran desde arriba. La mano del caballo apoya un solo dedo; la vaca, dos; el perro marca las uñas y el gato, no.
  { id: 'trackHorse', group: 'track', taxon: 'horse', track: { digits: 1, support: 'unguligrade', claws: false }, regions: [R('a', 'hoofPrint')] },
  { id: 'trackCow', group: 'track', taxon: 'cow', track: { digits: 2, support: 'unguligrade', claws: false }, regions: [R('a', 'hoofPrint'), R('b', 'cleftBetweenDigits')] },
  { id: 'trackDog', group: 'track', taxon: 'dog', track: { digits: 4, support: 'digitigrade', claws: true }, regions: [R('a', 'digitPad'), R('b', 'metacarpalPad'), R('c', 'clawMark')] },
  { id: 'trackCat', group: 'track', taxon: 'cat', track: { digits: 4, support: 'digitigrade', claws: false }, regions: [R('a', 'digitPad'), R('b', 'metacarpalPad')] },
  { id: 'trackBear', group: 'track', taxon: 'bear', track: { digits: 5, support: 'plantigrade', claws: true }, regions: [R('a', 'digitPad'), R('b', 'metacarpalPad'), R('c', 'clawMark')] },
  { id: 'trackBird', group: 'track', taxon: 'bird', track: { digits: 4, support: 'avian', claws: true }, regions: [R('a', 'digitPad'), R('b', 'hallux'), R('c', 'clawMark')] },
];

export const modelById = (id: string): AnatomyModel | undefined => ANATOMY_MODELS.find((m) => m.id === id);
export const modelsOf = (group: ModelGroup) => ANATOMY_MODELS.filter((m) => m.group === group);

/** Vector hacia la cámara con el modelo girado: guiñada alrededor de la vertical y cabeceo. */
export function viewVector(yawDeg: number, pitchDeg: number): [number, number, number] {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
}

/** ¿Se ve la región desde esta orientación? Basta con que su cara mire al menos ~70° hacia la cámara. */
export function regionVisible(r: AnatomyRegion, yawDeg: number, pitchDeg: number, minDot = 0.34): boolean {
  if (!r.facing) return true;
  const v = viewVector(yawDeg, pitchDeg);
  return r.facing[0] * v[0] + r.facing[1] * v[1] + r.facing[2] * v[2] >= minDot;
}

/** Una orientación desde la que se ve la región (la usan el modo guiado y las pruebas). */
export function orientationFor(r: AnatomyRegion): { yawDeg: number; pitchDeg: number } {
  const f = r.facing ?? [0, 0, 1];
  if (Math.abs(f[1]) > 0.5) return { yawDeg: 0, pitchDeg: f[1] > 0 ? 70 : -70 };
  return { yawDeg: (Math.atan2(f[0], f[2]) * 180) / Math.PI, pitchDeg: 0 };
}
