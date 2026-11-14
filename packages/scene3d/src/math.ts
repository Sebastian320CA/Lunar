import { Vector3 } from 'three';

/**
 * Convierte latitud/longitud (grados) en un punto de una esfera de radio `radius`.
 * Convencion: +Y es el polo norte, lon 0 mira hacia +Z, este positivo hacia +X.
 * PENDIENTE: confirmar visualmente contra la orientacion de la textura.
 */
export function latLonToVec3(latDeg: number, lonDeg: number, radius = 1): Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const c = Math.cos(lat);
  return new Vector3(radius * c * Math.sin(lon), radius * Math.sin(lat), radius * c * Math.cos(lon));
}
