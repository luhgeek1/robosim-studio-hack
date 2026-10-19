import { useMemo } from 'react'
import * as THREE from 'three'

const cache = new Map<string, THREE.Material>()

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key)
  if (!m) {
    m = make()
    cache.set(key, m)
  }
  return m as T
}

export const paint = (color: string, roughness = 0.42, metalness = 0.05, clearcoat = 0.5) =>
  cached(
    `p:${color}:${roughness}:${metalness}:${clearcoat}`,
    () => new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness: 0.35 }),
  )

export const M = {
  get shell() {
    return paint('#f5f6f8', 0.32, 0.02, 0.8)
  },
  get shell2() {
    return paint('#dde2e7', 0.45, 0.05, 0.4)
  },
  get dark() {
    return paint('#2a3037', 0.55, 0.15, 0.2)
  },
  get rubber() {
    return paint('#1b1e22', 0.85, 0, 0)
  },
  get steel() {
    return paint('#aeb6bf', 0.3, 0.75, 0)
  },
  get chrome() {
    return paint('#dfe4ea', 0.15, 0.95, 0)
  },
  get glass() {
    return cached(
      'glass-dark',
      () => new THREE.MeshPhysicalMaterial({ color: '#15191e', roughness: 0.08, metalness: 0.2, clearcoat: 1 }),
    )
  },
  get wood() {
    return paint('#c8a06c', 0.85, 0, 0)
  },
  get carton() {
    return paint('#d6b27f', 0.8, 0, 0)
  },
  get tape() {
    return paint('#e9d2a8', 0.6, 0, 0)
  },
  get rackBlue() {
    return paint('#3d5a86', 0.5, 0.35, 0.2)
  },
  get beamOrange() {
    return paint('#e38b3a', 0.45, 0.2, 0.3)
  },
}

/** Emissive material owned by one component, so its glow can pulse independently. */
export function useGlow(color: string, intensity = 1.6) {
  return useMemo(
    () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
    [color, intensity],
  )
}
