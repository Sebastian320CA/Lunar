import { AdditiveBlending, BackSide, FrontSide, Group, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * Atmosfera de la Tierra dibujada con shaders (sin texturas ni descargas):
 * - halo exterior (cara trasera de una esfera mayor) que brilla en el limbo;
 * - bruma interior (esfera apenas mayor) que aclara el borde del disco.
 * Ambas se intensifican en el lado iluminado por el Sol. Es una aproximacion visual, no fisica.
 */
const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

const HEADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
uniform vec3 uCenter;
uniform float uIntensity;
varying vec3 vNormalW;
varying vec3 vPosW;
float dayFactor() {
  vec3 up = normalize(vPosW - uCenter);
  return smoothstep(-0.35, 0.55, dot(up, uSunDir));
}`;

const HALO_FRAGMENT = /* glsl */ `${HEADER}
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = pow(max(0.0, 0.62 + dot(vNormalW, V)), 5.0);
  float day = dayFactor();
  vec3 col = mix(vec3(0.10, 0.22, 0.55), vec3(0.35, 0.65, 1.0), day);
  // Tinte calido cerca del terminador (amanecer/atardecer visto desde fuera).
  float dusk = smoothstep(0.15, 0.5, day) * (1.0 - smoothstep(0.5, 0.95, day));
  col = mix(col, vec3(1.0, 0.55, 0.35), dusk * 0.35);
  gl_FragColor = vec4(col * rim * (0.25 + 1.6 * day) * uIntensity, 1.0);
}`;

const HAZE_FRAGMENT = /* glsl */ `${HEADER}
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(cameraPosition - vPosW);
  float f = pow(1.0 - max(dot(vNormalW, V), 0.0), 2.6);
  float day = dayFactor();
  vec3 col = vec3(0.40, 0.68, 1.0);
  gl_FragColor = vec4(col * f * (0.08 + 1.1 * day) * uIntensity, 1.0);
}`;

export interface Atmosphere {
  readonly group: Group;
  /** `sunDir` y `center` en coordenadas de mundo; `intensity` 0..1 (atenuacion en `site`). */
  update(sunDir: Vector3, center: Vector3, intensity: number): void;
}

function material(fragmentShader: string, side: typeof FrontSide | typeof BackSide): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: {
      uSunDir: { value: new Vector3(1, 0, 0) },
      uCenter: { value: new Vector3() },
      uIntensity: { value: 1 },
    },
    side,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export function createAtmosphere(radius: number, segments = 64): Atmosphere {
  const group = new Group();
  group.name = 'atmosphere';
  const halo = new Mesh(new SphereGeometry(radius * 1.16, segments, segments / 2), material(HALO_FRAGMENT, BackSide));
  halo.name = 'atmosphere-halo';
  const haze = new Mesh(new SphereGeometry(radius * 1.012, segments, segments / 2), material(HAZE_FRAGMENT, FrontSide));
  haze.name = 'atmosphere-haze';
  haze.renderOrder = 1;
  group.add(halo, haze);
  const mats = [halo.material, haze.material];
  return {
    group,
    update(sunDir, center, intensity) {
      for (const m of mats) {
        (m.uniforms['uSunDir']?.value as Vector3).copy(sunDir).normalize();
        (m.uniforms['uCenter']?.value as Vector3).copy(center);
        if (m.uniforms['uIntensity']) m.uniforms['uIntensity'].value = intensity;
      }
    },
  };
}
