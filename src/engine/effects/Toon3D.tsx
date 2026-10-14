/**
 * Estilo «cel shading»: luz en bandas (sin degradados) y contorno oscuro alrededor de cada objeto del laboratorio,
 * para que el vidrio transparente (tubos, vasos, frascos) se distinga contra la pared y la mesada claras.
 *
 * - Bandas: la iluminación directa de los materiales estándar/físicos se cuantiza con un `define` (CEL_SHADING);
 *   los materiales NO se reemplazan, así el código que cambia su color u opacidad sigue funcionando.
 * - Contorno: cada fotograma se dibuja aparte un «mapa de identidad» (cada objeto de un color plano y opaco, vidrio
 *   incluido; la sala solo tapa) y un rectángulo de pantalla completa traza una línea donde cambia el objeto o
 *   donde la profundidad salta dentro del mismo objeto (bocas, huecos de la gradilla).
 * Este componente toma el control del render (useFrame con prioridad 1).
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Marca un grupo como objeto con contorno propio (un número distinto por objeto). */
let nextId = 0;
export function outlineObject(o: THREE.Object3D): void {
  o.userData.outlineId = (nextId++ % 4095) + 1;
}
/** Marca un grupo (la sala) que tapa contornos pero no lleva contorno. */
export function outlineOccluder(o: THREE.Object3D): void {
  o.userData.outlineId = 0;
}

// --- Bandas de luz -------------------------------------------------------------------------------------------------
let patched = false;
function patchLighting(): void {
  if (patched) return;
  patched = true;
  const key = 'lights_physical_pars_fragment' as const;
  let src = THREE.ShaderChunk[key];
  src = src.replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\n\tvec3 irradiance',
    `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	#ifdef CEL_SHADING
		// Tres tonos: sombra, medio tono y luz plena, con un borde apenas suavizado.
		dotNL = 0.55 * smoothstep( 0.0, 0.05, dotNL ) + 0.45 * smoothstep( 0.42, 0.48, dotNL );
	#endif

	vec3 irradiance`,
  );
  src = src.replace(
    'vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
    `vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef CEL_SHADING
		// Brillo de borde nítido (solo en superficies pulidas: vidrio, metal, plástico brillante).
		specularBRDF = vec3( 0.35 * smoothstep( 0.9, 1.1, max3( specularBRDF ) ) );
	#endif`,
  );
  THREE.ShaderChunk[key] = src;

  // Luz ambiente casi uniforme: el volumen lo dan las bandas.
  let env = THREE.ShaderChunk.envmap_physical_pars_fragment;
  env = env.replace(
    'vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );',
    `vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			#ifdef CEL_SHADING
				worldNormal = normalize( mix( worldNormal, vec3( 0.0, 1.0, 0.0 ), 0.8 ) );
			#endif`,
  );
  THREE.ShaderChunk.envmap_physical_pars_fragment = env;

  let hemi = THREE.ShaderChunk.lights_pars_begin;
  hemi = hemi.replace(
    'float hemiDiffuseWeight = 0.5 * dotNL + 0.5;',
    `float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		#ifdef CEL_SHADING
			hemiDiffuseWeight = mix( 0.35, 0.9, smoothstep( 0.45, 0.55, hemiDiffuseWeight ) );
		#endif`,
  );
  THREE.ShaderChunk.lights_pars_begin = hemi;
}

type Lit = THREE.MeshStandardMaterial & { defines?: Record<string, unknown> };
function isLit(m: THREE.Material): m is Lit {
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

// --- Mapa de identidad y contorno ----------------------------------------------------------------------------------
const OUTLINE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const OUTLINE_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tId;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;

float depthAt(vec2 uv) {
  return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
}

void main() {
  vec4 c0 = texture2D(tId, vUv);
  float d0 = -depthAt(vUv);
  float edge = 0.0;
  // Cambio de objeto: alguno de los dos lados es un objeto (azul = 1); entre sala y fondo no hay línea.
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 off = vec2(cos(a), sin(a)) * texel;
    vec4 ci = texture2D(tId, vUv + off);
    if ((c0.b > 0.5 || ci.b > 0.5) && distance(c0.rgb, ci.rgb) > 0.02) edge += 1.0;
  }
  // Salto de profundidad dentro del mismo objeto (laplaciano: las superficies inclinadas no cuentan).
  if (c0.b > 0.5 && edge == 0.0) {
    float dl = -depthAt(vUv - vec2(texel.x, 0.0));
    float dr = -depthAt(vUv + vec2(texel.x, 0.0));
    float dd = -depthAt(vUv - vec2(0.0, texel.y));
    float du = -depthAt(vUv + vec2(0.0, texel.y));
    float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
    // Transición gradual: un borde que ronda el umbral (canto fino) no queda punteado.
    edge = 3.0 * smoothstep(0.03, 0.07, lap / d0);
  }
  float a = smoothstep(0.0, 3.0, edge) * opacity;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}`;

function idColor(id: number): THREE.Color {
  // 12 bits en dos canales de 64 niveles (separados lo bastante para sobrevivir a 8 bits); azul = «es un objeto».
  return new THREE.Color().setRGB((id % 64) / 63, Math.floor(id / 64) % 64 / 63, 1, THREE.LinearSRGBColorSpace);
}

export function Toon3D({ lineColor = 0x161c22, lineOpacity = 0.92, linePx = 1.25 }: { lineColor?: number; lineOpacity?: number; linePx?: number }) {
  const { gl, scene, camera } = useThree();
  patchLighting();

  const res = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    target.depthTexture = new THREE.DepthTexture(1, 1);
    const occluder = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide });
    const ids = new Map<number, THREE.MeshBasicMaterial>();
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: OUTLINE_VERT,
        fragmentShader: OUTLINE_FRAG,
        uniforms: {
          tId: { value: target.texture },
          tDepth: { value: target.depthTexture },
          texel: { value: new THREE.Vector2() },
          near: { value: 1 },
          far: { value: 1000 },
          color: { value: new THREE.Color(lineColor) },
          opacity: { value: lineOpacity },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    overlay.frustumCulled = false;
    // Encima de objetos y efectos, debajo de etiquetas y marcadores (renderOrder ≥ 10).
    overlay.renderOrder = 9;
    return { target, occluder, ids, overlay, lit: new Set<Lit>(), swapped: [] as Array<[THREE.Mesh, THREE.Material | THREE.Material[], number]>, hidden: [] as THREE.Object3D[], size: new THREE.Vector2() };
  }, [lineColor, lineOpacity]);

  useEffect(() => {
    scene.add(res.overlay);
    const lit = res.lit;
    return () => {
      scene.remove(res.overlay);
      res.overlay.geometry.dispose();
      (res.overlay.material as THREE.Material).dispose();
      res.target.depthTexture?.dispose();
      res.target.dispose();
      res.occluder.dispose();
      res.ids.forEach((m) => m.dispose());
      // Los materiales compartidos vuelven a su sombreado normal (otras prácticas los reutilizan).
      lit.forEach((m) => {
        if (m.defines) delete m.defines.CEL_SHADING;
        m.needsUpdate = true;
      });
      lit.clear();
    };
  }, [scene, res]);

  useFrame(() => {
    const { target, occluder, ids, overlay, lit, swapped, hidden, size } = res;
    gl.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
    const px = Math.max(1, linePx * gl.getPixelRatio());
    const u = (overlay.material as THREE.ShaderMaterial).uniforms;
    u.texel.value.set(px / size.x, px / size.y);
    const cam = camera as THREE.PerspectiveCamera;
    u.near.value = cam.near;
    u.far.value = cam.far;

    // Recorrido: bandas en cada material nuevo y material plano de identidad para el mapa.
    const idMat = (id: number) => {
      let m = ids.get(id);
      if (!m) ids.set(id, (m = new THREE.MeshBasicMaterial({ color: idColor(id), fog: false, side: THREE.DoubleSide })));
      return m;
    };
    const walk = (o: THREE.Object3D, id: number) => {
      if (!o.visible) return;
      if (typeof o.userData.outlineId === 'number') id = o.userData.outlineId;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (isLit(m) && !lit.has(m)) {
            m.defines = { ...(m.defines ?? {}), CEL_SHADING: '' };
            m.needsUpdate = true;
            lit.add(m);
          }
        }
        const shown = mats.some((m) => m.visible);
        if (id < 0 || !shown || (id === 0 && mats.every((m) => m.transparent))) hidden.push(o);
        else swapped.push([mesh, mesh.material, id]);
      } else if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) hidden.push(o);
      for (const c of o.children) walk(c, id);
    };
    walk(scene, -1);

    for (const [mesh, , id] of swapped) mesh.material = id === 0 ? occluder : idMat(id);
    for (const o of hidden) o.visible = false;

    const bg = scene.background;
    const fog = scene.fog;
    const shadowAuto = gl.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    gl.shadowMap.autoUpdate = false;
    const clear = gl.getClearColor(new THREE.Color());
    const clearA = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(clear, clearA);
    gl.shadowMap.autoUpdate = shadowAuto;
    scene.background = bg;
    scene.fog = fog;
    for (const [mesh, m] of swapped) mesh.material = m;
    for (const o of hidden) o.visible = true;
    swapped.length = 0;
    hidden.length = 0;

    gl.render(scene, camera);
  }, 1);

  return null;
}
