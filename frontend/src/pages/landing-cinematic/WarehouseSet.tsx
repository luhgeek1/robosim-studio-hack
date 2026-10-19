import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'

type V3 = [number, number, number]
type Part = { position: V3; size: V3 }

function Batch({ parts, color, metal = 0.1 }: { parts: Part[]; color: string; metal?: number }) {
  const meshRef = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!meshRef.current) return
    const object = new Object3D()
    parts.forEach((part, index) => {
      object.position.set(...part.position)
      object.scale.set(...part.size)
      object.updateMatrix()
      meshRef.current?.setMatrixAt(index, object.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.computeBoundingSphere()
  }, [parts])
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, parts.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color={color} metalness={metal} roughness={0.5} />
    </instancedMesh>
  )
}

export function WarehouseSet() {
  const parts = useMemo(() => {
    const steel: Part[] = [],
      beams: Part[] = [],
      cargo: Part[] = [],
      tape: Part[] = []
    for (const x of [-6, 0, 6])
      for (const z of [-5, 0, 5]) {
        for (const dx of [-2, 2])
          for (const dz of [-0.8, 0.8]) {
            steel.push({ position: [x + dx, 2.35, z + dz], size: [0.1, 4.7, 0.1] })
          }
        for (const y of [0.35, 1.7, 3.05]) {
          steel.push({ position: [x, y, z], size: [4.1, 0.09, 1.7] })
          for (const dz of [-0.85, 0.85]) beams.push({ position: [x, y, z + dz], size: [4.1, 0.16, 0.07] })
          for (const dx of [-1.32, 0, 1.32]) {
            cargo.push({ position: [x + dx, y + 0.51, z], size: [1.1, 0.9, 1.36] })
            tape.push({ position: [x + dx, y + 0.965, z], size: [0.14, 0.015, 1.37] })
          }
        }
      }
    return { steel, beams, cargo, tape }
  }, [])
  return (
    <group>
      <Batch parts={parts.steel} color="#687065" metal={0.6} />
      <Batch parts={parts.beams} color="#e76136" metal={0.35} />
      <Batch parts={parts.cargo} color="#d6cdb7" />
      <Batch parts={parts.tape} color="#b1a387" />
    </group>
  )
}
