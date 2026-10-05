/**
 * Fórmulas químicas (Práctica 4, §15): análisis de fórmulas escritas por el estudiante o por el motor.
 * Acepta notación ASCII («Fe(OH)3», «SO4^2-», «Cu2+», «e-») y Unicode («SO₄²⁻», «Fe(OH)₃»), hidratos con «·»
 * y devuelve la composición elemental y la carga. Es la base del balance de átomos y de carga: nunca se valida
 * una ecuación comparando texto.
 */

/** Masas atómicas estándar (g/mol, IUPAC abreviadas). */
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, Na: 22.99, Mg: 24.305, Al: 26.982, S: 32.06, Cl: 35.45, K: 39.098,
  Ca: 40.078, Fe: 55.845, Cu: 63.546, Zn: 65.38, Li: 6.94, Ba: 137.33, Ag: 107.87,
};

export interface ParsedFormula {
  elements: Record<string, number>;
  charge: number;
  /** Electrón libre («e⁻») en semirreacciones. */
  electron: boolean;
  /** Forma ASCII normalizada (clave estable, p. ej. «SO4^2-»). */
  key: string;
}

const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

/**
 * Normaliza la escritura: subíndices Unicode → dígitos, superíndices → «^n±», guiones tipográficos → «-».
 * Las cargas pueden escribirse «Cu2+», «Cu^2+», «Cu+2», «Cu²⁺» o «Cu(2+)».
 */
function normalize(raw: string): string {
  let s = raw.trim().replace(/\s+/g, '').replace(/[−–—]/g, '-').replace(/\*/g, '·').replace(/\./g, '·');
  let out = '';
  let inSup = false;
  for (const ch of s) {
    if (SUB[ch] !== undefined) {
      out += SUB[ch];
      inSup = false;
    } else if (SUP[ch] !== undefined) {
      if (!inSup) out += '^';
      out += SUP[ch];
      inSup = true;
    } else {
      out += ch;
      inSup = false;
    }
  }
  s = out;
  return s;
}

/** Separa la carga del final: devuelve [cuerpo, carga]. */
function splitCharge(s: string): [string, number] | null {
  // «X^2+», «X^+», «X^2-»
  let m = /^(.*)\^(\d*)([+-])$/.exec(s);
  if (m) return [m[1], (m[3] === '+' ? 1 : -1) * (m[2] ? Number(m[2]) : 1)];
  // «X^+2» / «X+2» (signo antes del número)
  m = /^(.*?)\^?([+-])(\d+)$/.exec(s);
  if (m && /[A-Za-z)\]]$/.test(m[1])) return [m[1], (m[2] === '+' ? 1 : -1) * Number(m[3])];
  // «X(2+)»
  m = /^(.*)\((\d*)([+-])\)$/.exec(s);
  if (m) return [m[1], (m[3] === '+' ? 1 : -1) * (m[2] ? Number(m[2]) : 1)];
  // «Cu2+»: dígito(s) y signo al final. Ambiguo con subíndice («SO42-»): el último dígito es la carga
  // solo si hay más de un dígito o si el cuerpo termina en letra/paréntesis.
  m = /^(.*?)(\d*)([+-]+)$/.exec(s);
  if (m) {
    const signs = m[3];
    const sign = signs[0] === '+' ? 1 : -1;
    if (signs.length > 1) {
      // «Fe+++»
      if (!/^[+]+$|^[-]+$/.test(signs)) return null;
      return [m[1] + m[2], sign * signs.length];
    }
    const digits = m[2];
    if (!digits) return [m[1], sign];
    // «SO42-»: el cuerpo «SO4» necesita su subíndice; se toma la carga como el último dígito.
    if (digits.length > 1) return [m[1] + digits.slice(0, -1), sign * Number(digits.slice(-1))];
    // Un solo dígito: en un ion monoatómico es la carga («Cu2+», «Fe3+»); en uno poliatómico es el subíndice
    // del último elemento y la carga vale 1 («NH4+», «HCO3-»). Para otros casos, escribir «^» («FeOH^2+»).
    if (/^[A-Z][a-z]?$/.test(m[1])) return [m[1], sign * Number(digits)];
    return [m[1] + digits, sign];
  }
  return [s, 0];
}

function parseBody(s: string): Record<string, number> | null {
  const stack: Array<Record<string, number>> = [{}];
  let i = 0;
  const add = (rec: Record<string, number>, el: string, n: number) => {
    rec[el] = (rec[el] ?? 0) + n;
  };
  const readNum = (): number => {
    let j = i;
    while (j < s.length && /\d/.test(s[j])) j++;
    const n = j > i ? Number(s.slice(i, j)) : 1;
    i = j;
    return n;
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(' || ch === '[') {
      stack.push({});
      i++;
    } else if (ch === ')' || ch === ']') {
      i++;
      const n = readNum();
      const top = stack.pop();
      if (!top || !stack.length) return null;
      for (const [el, k] of Object.entries(top)) add(stack[stack.length - 1], el, k * n);
    } else if (/[A-Z]/.test(ch)) {
      let el = ch;
      i++;
      if (i < s.length && /[a-z]/.test(s[i])) {
        el += s[i];
        i++;
      }
      if (ATOMIC_MASS[el] === undefined) return null;
      add(stack[stack.length - 1], el, readNum());
    } else return null;
  }
  if (stack.length !== 1) return null;
  return stack[0];
}

/** Analiza una fórmula. Devuelve `null` si no es una fórmula química válida. */
export function parseFormula(raw: string): ParsedFormula | null {
  if (!raw) return null;
  const s = normalize(raw);
  if (s === 'e-' || s === 'e^-' || s === 'e' || s === 'e^1-') return { elements: {}, charge: -1, electron: true, key: 'e-' };
  // Coeficiente pegado («2H2O») no es parte de la fórmula: lo rechaza el editor (se escribe en su campo).
  if (/^\d/.test(s)) return null;
  const parts = s.split('·');
  let charge = 0;
  const elements: Record<string, number> = {};
  const bodies: string[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    let p = parts[pi];
    let mult = 1;
    let prefix = '';
    if (pi > 0) {
      const m = /^(\d+)(.*)$/.exec(p);
      if (m) {
        mult = Number(m[1]);
        prefix = m[1];
        p = m[2];
      }
    }
    const sc = pi === parts.length - 1 ? splitCharge(p) : [p, 0] as [string, number];
    if (!sc) return null;
    const body = parseBody(sc[0]);
    if (!body || !Object.keys(body).length) return null;
    for (const [el, n] of Object.entries(body)) elements[el] = (elements[el] ?? 0) + n * mult;
    charge += sc[1];
    bodies.push(prefix + sc[0]);
  }
  // La clave conserva el orden escrito del cuerpo y unifica la notación de carga.
  const key = bodies.join('·') + (charge ? `^${Math.abs(charge) === 1 ? '' : Math.abs(charge)}${charge > 0 ? '+' : '-'}` : '');
  return { elements, charge, electron: false, key };
}

export function molarMass(elements: Record<string, number>): number {
  let m = 0;
  for (const [el, n] of Object.entries(elements)) m += (ATOMIC_MASS[el] ?? 0) * n;
  return m;
}

/** Igualdad de composición (misma especie aunque se escriba distinto, p. ej. «HO-» y «OH-»). */
export function sameSpecies(a: ParsedFormula, b: ParsedFormula): boolean {
  if (a.electron || b.electron) return a.electron === b.electron;
  if (a.charge !== b.charge) return false;
  const ka = Object.keys(a.elements).filter((k) => a.elements[k]);
  const kb = Object.keys(b.elements).filter((k) => b.elements[k]);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a.elements[k] === b.elements[k]);
}

/** Huella de composición independiente del orden (para comparar especies). */
export function compositionKey(p: ParsedFormula): string {
  if (p.electron) return 'e-';
  return Object.keys(p.elements).filter((k) => p.elements[k]).sort().map((k) => `${k}${p.elements[k]}`).join('') + (p.charge ? `|${p.charge}` : '');
}

const SUB_OUT = '₀₁₂₃₄₅₆₇₈₉';
const SUP_OUT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' };

/** Escritura con subíndices y superíndices Unicode («SO4^2-» → «SO₄²⁻», «Fe(OH)3» → «Fe(OH)₃»). */
export function prettyFormula(ascii: string): string {
  const s = normalize(ascii);
  if (s === 'e-') return 'e⁻';
  const sc = splitCharge(s.split('·').pop() ?? s);
  const head = s.split('·').slice(0, -1);
  const body = sc ? sc[0] : s;
  const charge = sc ? sc[1] : 0;
  const sub = (t: string) => t.replace(/(?<=[A-Za-z)\]])(\d+)/g, (d) => [...d].map((c) => SUB_OUT[Number(c)]).join(''));
  let out = [...head.map((h) => h.replace(/^(\d*)(.*)$/, (_m, n: string, rest: string) => n + sub(rest))), sub(body)].join('·');
  if (charge) out += [...`${Math.abs(charge) === 1 ? '' : Math.abs(charge)}${charge > 0 ? '+' : '-'}`].map((c) => SUP_OUT[c]).join('');
  return out;
}
