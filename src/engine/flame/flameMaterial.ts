/**
 * Material paramétrico de llama (§6.8, §9.5): malla de revolución con gradiente, ruido animado y oscilación;
 * la apariencia depende de uniformes (colores salidos del modelo espectral, transparencia, borde, oscilación).
 * El vidrio de cobalto se aplica POR FRAGMENTO: si el rayo cámara→fragmento cruza el rectángulo del vidrio,
 * se usa el color filtrado espectralmente (no una superposición azul).
 */
import * as THREE from 'three';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uWobble;
  uniform float uSeed;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vT;
  void main() {
    vec3 p = position;
    float t = clamp(p.y, 0.0, 1.0);
    float sway = (sin(uTime * 7.0 + t * 5.0 + uSeed) + 0.6 * sin(uTime * 11.3 + t * 9.0 + uSeed * 2.0)) * uWobble * t * t;
    p.x += sway;
    p.z += 0.6 * sway * cos(uTime * 5.0 + uSeed);
    vT = t;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColAf;
  uniform vec3 uColBf;
  uniform float uAlpha;
  uniform float uEdge;
  uniform float uNoise;
  uniform float uTipFade;
  uniform float uClipY;
  uniform float uGlassOn;
  uniform vec3 uGC;
  uniform vec3 uGU;
  uniform vec3 uGV;
  uniform vec3 uGN;
  uniform vec2 uGH;
  uniform float uPremul;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vT;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  bool behindGlass(vec3 p) {
    vec3 d = p - cameraPosition;
    float den = dot(d, uGN);
    if (abs(den) < 1e-5) return false;
    float t = dot(uGC - cameraPosition, uGN) / den;
    if (t <= 0.0 || t >= 1.0) return false;
    vec3 h = cameraPosition + d * t - uGC;
    return abs(dot(h, uGU)) < uGH.x && abs(dot(h, uGV)) < uGH.y;
  }
  void main() {
    if (vWorld.y > uClipY) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormalW), V));
    float rim = pow(1.0 - facing, 1.4);
    float body = mix(0.35 + 0.65 * facing, 0.15 + rim, uEdge);
    float n = noise(vec2(vT * 7.0 - uTime * 3.2, (vWorld.x + vWorld.z) * 0.9 + uTime * 0.7));
    float tip = 1.0 - smoothstep(1.0 - uTipFade, 1.0, vT);
    float base = smoothstep(0.0, 0.05, vT);
    vec3 col = mix(uColA, uColB, vT);
    if (uGlassOn > 0.5 && behindGlass(vWorld)) col = mix(uColAf, uColBf, vT);
    float a = uAlpha * body * tip * base * (1.0 - uNoise + uNoise * 1.6 * n);
    gl_FragColor = vec4(uPremul > 0.5 ? col * a : col, a);
    // Los colores se calculan en espacio lineal (salen del espectro): se codifican para la pantalla.
    #include <colorspace_fragment>
  }
`;

export interface GlassUniforms {
  on: boolean;
  center: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
  halfW: number;
  halfH: number;
}

/** `additive`: emisión transparente (llama azul, penachos); si no, capa luminosa con mezcla normal (hollín incandescente). */
export function createFlameMaterial(seed = 0, additive = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uWobble: { value: 0 },
      uSeed: { value: seed },
      uColA: { value: new THREE.Color(0, 0, 0) },
      uColB: { value: new THREE.Color(0, 0, 0) },
      uColAf: { value: new THREE.Color(0, 0, 0) },
      uColBf: { value: new THREE.Color(0, 0, 0) },
      uAlpha: { value: 0 },
      uEdge: { value: 0 },
      uNoise: { value: 0.3 },
      uTipFade: { value: 0.3 },
      uClipY: { value: 1e6 },
      uGlassOn: { value: 0 },
      uGC: { value: new THREE.Vector3() },
      uGU: { value: new THREE.Vector3(1, 0, 0) },
      uGV: { value: new THREE.Vector3(0, 1, 0) },
      uGN: { value: new THREE.Vector3(0, 0, 1) },
      uGH: { value: new THREE.Vector2(1, 1) },
      uPremul: { value: additive ? 1 : 0 },
    },
  });
}

export function setGlass(m: THREE.ShaderMaterial, g: GlassUniforms) {
  const u = m.uniforms;
  u.uGlassOn.value = g.on ? 1 : 0;
  u.uGC.value.copy(g.center);
  u.uGU.value.copy(g.u);
  u.uGV.value.copy(g.v);
  u.uGN.value.copy(g.n);
  u.uGH.value.set(g.halfW, g.halfH);
}

/** Perfil unitario de la llama (radio relativo vs altura 0–1): base angosta, máximo a ~30 % y punta. */
export function flameProfile(points = 18): THREE.Vector2[] {
  const out: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  for (let i = 1; i <= points; i++) {
    const t = i / points;
    const r = t < 0.3 ? 0.62 + 0.38 * Math.sqrt(t / 0.3) : Math.max(0.001, 1 - ((t - 0.3) / 0.7) ** 1.6);
    out.push(new THREE.Vector2(r, t));
  }
  return out;
}

/** Cono interno unitario. */
export function coneProfile(): THREE.Vector2[] {
  return [new THREE.Vector2(1, 0), new THREE.Vector2(0.75, 0.35), new THREE.Vector2(0.4, 0.75), new THREE.Vector2(0.001, 1)];
}

/** Penacho de color (gota alargada) desde la muestra hacia la punta. */
export function plumeProfile(): THREE.Vector2[] {
  const out: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    out.push(new THREE.Vector2(Math.max(0.001, Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.7 * (1 - t * 0.55)), t));
  }
  return out;
}
