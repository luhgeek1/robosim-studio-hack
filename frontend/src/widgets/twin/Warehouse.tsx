import { Grid, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FLOOR, RACK_ROWS, RACK_X0, RACK_X1 } from './layout'
import { C } from './palette'

export function Floor() {
  return (
    <group>
      {/* Keep the slab top below the floor to prevent coplanar depth flickering. */}
      <mesh receiveShadow position={[0, -0.58, 0]} castShadow>
        <boxGeometry args={[FLOOR.w + 0.6, 1.1, FLOOR.d + 0.6]} />
        <meshStandardMaterial color="#8097a5" roughness={0.8} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[FLOOR.w, FLOOR.d]} />
        <meshStandardMaterial color={C.floor} roughness={0.85} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.12, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={C.bg} roughness={1} />
      </mesh>
      {[-1, 1].map((side) =>
        [-9, -3, 3, 9].map((z) => (
          <group key={`${side}:${z}`} position={[side * 29.6, 0.05, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.8, 3.4]} />
              <meshStandardMaterial color={side < 0 ? '#bfdad5' : '#c4d4e7'} />
            </mesh>
            {[-1, 0, 1].map((mark) => (
              <mesh key={mark} position={[0, 0.01, mark * 0.85]} rotation={[-Math.PI / 2, 0, -0.35]}>
                <planeGeometry args={[1.6, 0.17]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            ))}
          </group>
        )),
      )}
      <Grid
        position={[0, 0.005, 0]}
        args={[FLOOR.w, FLOOR.d]}
        cellSize={2}
        cellThickness={0.6}
        cellColor={C.grid}
        sectionSize={10}
        sectionThickness={0.9}
        sectionColor="#d6d6d1"
        fadeDistance={140}
        fadeStrength={0.6}
        infiniteGrid={false}
      />
      {/* perimeter */}
      <Line
        points={[
          [-FLOOR.w / 2, 0.02, -FLOOR.d / 2],
          [FLOOR.w / 2, 0.02, -FLOOR.d / 2],
          [FLOOR.w / 2, 0.02, FLOOR.d / 2],
          [-FLOOR.w / 2, 0.02, FLOOR.d / 2],
          [-FLOOR.w / 2, 0.02, -FLOOR.d / 2],
        ]}
        color="#c9c9c4"
        lineWidth={1}
      />
      {/* docks */}
      {[-9, -3, 3, 9].map((z) => (
        <mesh key={`dl${z}`} position={[-FLOOR.w / 2 + 0.2, 0.35, z]}>
          <boxGeometry args={[0.4, 0.7, 3.2]} />
          <meshStandardMaterial color="#cfcfca" roughness={0.9} />
        </mesh>
      ))}
      {[-9, -3, 3, 9].map((z) => (
        <mesh key={`dr${z}`} position={[FLOOR.w / 2 - 0.2, 0.35, z]}>
          <boxGeometry args={[0.4, 0.7, 3.2]} />
          <meshStandardMaterial color="#cfcfca" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export function Racks() {
  const uprights = useRef<THREE.InstancedMesh>(null)
  const pallets = useRef<THREE.InstancedMesh>(null)
  const boxes = useRef<THREE.InstancedMesh>(null)
  const layout = useMemo(() => {
    const ups: THREE.Matrix4[] = []
    const pal: THREE.Matrix4[] = []
    const bx: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const bays = 9
    const bayW = (RACK_X1 - RACK_X0) / bays
    const levels = 3
    let seed = 7
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (const z of RACK_ROWS) {
      for (let b = 0; b <= bays; b++) {
        const x = RACK_X0 + b * bayW
        for (const dz of [-0.95, 0.95]) {
          ups.push(m.clone().compose(new THREE.Vector3(x, 2.5, z + dz), q, new THREE.Vector3(0.14, 5.0, 0.14)))
        }
      }
      for (let b = 0; b < bays; b++) {
        const x = RACK_X0 + (b + 0.5) * bayW
        for (let l = 0; l < levels; l++) {
          const y = 0.3 + l * 1.6
          for (const dz of [-0.5, 0.5]) {
            if (rnd() < 0.78) {
              pal.push(
                m.clone().compose(new THREE.Vector3(x, y + 0.06, z + dz), q, new THREE.Vector3(bayW * 0.8, 0.12, 0.9)),
              )
              const h = 0.6 + rnd() * 0.6
              bx.push(
                m
                  .clone()
                  .compose(new THREE.Vector3(x, y + 0.12 + h / 2, z + dz), q, new THREE.Vector3(bayW * 0.72, h, 0.82)),
              )
            }
          }
        }
      }
    }
    return { ups, pal, bx, bayW, levels }
  }, [])
  useEffect(() => {
    layout.ups.forEach((mat, i) => uprights.current!.setMatrixAt(i, mat))
    uprights.current!.instanceMatrix.needsUpdate = true
    layout.pal.forEach((mat, i) => pallets.current!.setMatrixAt(i, mat))
    pallets.current!.instanceMatrix.needsUpdate = true
    layout.bx.forEach((mat, i) => boxes.current!.setMatrixAt(i, mat))
    boxes.current!.instanceMatrix.needsUpdate = true
  }, [layout])
  return (
    <group>
      <instancedMesh ref={uprights} args={[undefined, undefined, layout.ups.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.upright} roughness={0.7} />
      </instancedMesh>
      {RACK_ROWS.map((z) =>
        Array.from({ length: layout.levels }).map((_, l) =>
          [-0.95, 0.95].map((dz) => (
            <mesh key={`${z}-${l}-${dz}`} position={[(RACK_X0 + RACK_X1) / 2, 0.3 + l * 1.6, z + dz]} castShadow>
              <boxGeometry args={[RACK_X1 - RACK_X0, 0.1, 0.1]} />
              <meshStandardMaterial color={C.beam} roughness={0.6} />
            </mesh>
          )),
        ),
      )}
      <instancedMesh ref={pallets} args={[undefined, undefined, layout.pal.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.pallet} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, layout.bx.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.box} roughness={0.85} />
      </instancedMesh>
    </group>
  )
}

export function Stations() {
  const shipPallets = useMemo(() => {
    const out: [number, number, number][] = []
    let seed = 3
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (const z of [-10.5, -8.5, -2.5, -0.5, 4.5, 6.5, 10.5, 12.5])
      out.push([27.6 + (rnd() - 0.5) * 0.6, z, 0.5 + rnd() * 0.7])
    return out
  }, [])
  return (
    <group>
      {/* packing stations in the picking zone */}
      {[-9, -3, 3, 9].map((z) => (
        <group key={z} position={[16, 0, z]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[2.4, 0.08, 1.1]} />
            <meshStandardMaterial color="#e6e6e2" roughness={0.8} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 1.05, 0.22, 0]}>
              <boxGeometry args={[0.1, 0.44, 0.9]} />
              <meshStandardMaterial color="#8f8f95" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0.6, 0.62, -0.2]} castShadow>
            <boxGeometry args={[0.6, 0.26, 0.45]} />
            <meshStandardMaterial color={C.box} roughness={0.85} />
          </mesh>
          <mesh position={[-0.5, 0.55, 0.2]} castShadow>
            <boxGeometry args={[0.45, 0.12, 0.35]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* pallets staged at the shipping docks */}
      {shipPallets.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <boxGeometry args={[1.2, 0.14, 1.0]} />
            <meshStandardMaterial color={C.pallet} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14 + h / 2, 0]} castShadow>
            <boxGeometry args={[1.05, h, 0.88]} />
            <meshStandardMaterial color={C.box} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
