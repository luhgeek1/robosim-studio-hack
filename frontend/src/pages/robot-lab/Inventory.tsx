import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Group, Mesh, DoubleSide } from 'three'
import { Block, Sensor, Wheels } from './Parts'
import type { MachineProps } from './Machines'

const smooth = (x: number) => {
  const p = Math.min(1, Math.max(0, x))
  return p * p * (3 - 2 * p)
}

export function Inventory({ heavy, paused, speed, color }: MachineProps) {
  const rows = heavy ? 4 : 3
  const total = rows * 2
  const clock = useRef(0)
  const chassis = useRef<Group>(null)
  const head = useRef<Group>(null)
  const beam = useRef<Group>(null)
  const line = useRef<Mesh>(null)
  const [step, setStep] = useState({ index: 0, phase: 0 })
  const previous = useRef('')
  const yOf = (index: number) => 0.75 + Math.floor(index / 2) * 0.5
  useFrame((_, dt) => {
    if (!paused) clock.current += Math.min(dt, 0.05) * speed
    const cycle = clock.current % (total * 3.6 + 2)
    const done = cycle >= total * 3.6
    const index = Math.min(total - 1, Math.floor(cycle / 3.6))
    const local = cycle - index * 3.6
    const phase = done ? 3 : local < 1.2 ? 0 : local < 2.8 ? 1 : 2
    const key = `${index}-${phase}`
    if (key !== previous.current) {
      previous.current = key
      setStep({ index, phase })
    }
    const prev = index === 0 ? total - 1 : index - 1
    const progress = smooth(local / 1.15)
    const x = ((prev % 2) * 1.1 - 0.55) * (1 - progress) + ((index % 2) * 1.1 - 0.55) * progress
    const y = yOf(prev) * (1 - progress) + yOf(index) * progress
    if (chassis.current) chassis.current.position.x = x
    if (head.current) head.current.position.y = y
    if (beam.current) {
      beam.current.visible = phase === 1
      beam.current.position.set(x, y, 0)
    }
    if (line.current) line.current.position.y = Math.sin((local - 1.2) * 5) * 0.095
  })
  const completed = step.phase === 3 ? total : step.index + (step.phase === 2 ? 1 : 0)
  const status = ['Подъезжает к ячейке', 'Считывает штрихкод', 'Позиция учтена', 'Проверка завершена'][step.phase]
  return (
    <group>
      <Html position={[0, rows * 0.5 + 1.12, -0.6]} center style={{ pointerEvents: 'none', width: 225 }}>
        <div className="rounded-xl border border-white bg-white/95 px-4 py-3 text-center shadow-sm">
          <div className="text-[10px] uppercase tracking-widest text-ink-3">Инвентаризация стеллажа</div>
          <div className="mt-1 text-sm font-semibold">{paused ? 'Пауза' : status}</div>
          <div className="mt-1 text-xs text-ink-3">
            {completed} из {total} позиций проверено
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-black/5">
            <div className="h-full rounded bg-emerald-500" style={{ width: `${(completed / total) * 100}%` }} />
          </div>
        </div>
      </Html>
      {[-1.2, 1.2].flatMap((x) =>
        [-0.95, -0.35].map((z) => (
          <Block
            key={`${x}-${z}`}
            size={[0.075, rows * 0.5 + 0.6, 0.075]}
            at={[x, (rows * 0.5 + 0.6) / 2, z]}
            color="#536672"
          />
        )),
      )}
      {Array.from({ length: rows }, (_, row) => (
        <Block key={row} size={[2.5, 0.055, 0.75]} at={[0, 0.54 + row * 0.5, -0.65]} color="#a8b9c3" />
      ))}
      {Array.from({ length: total }, (_, index) => {
        const checked = index < completed
        const active = index === step.index && step.phase === 1
        return (
          <group key={index} position={[(index % 2) * 1.1 - 0.55, yOf(index), -0.65]}>
            <Block size={[0.78, 0.36, 0.53]} color={checked ? '#a9c9b6' : '#cfb48e'} />
            <Block size={[0.1, 0.365, 0.535]} color="#e6d5b4" />
            <Block size={[0.33, 0.18, 0.01]} at={[0, 0, 0.272]} color="#fffaf0" />
            {Array.from({ length: 13 }, (_, bar) => (
              <mesh key={bar} position={[-0.13 + bar * 0.021, 0, 0.28]}>
                <boxGeometry args={[bar % 3 === 0 ? 0.014 : 0.007, 0.12, 0.004]} />
                <meshBasicMaterial color="#23303a" />
              </mesh>
            ))}
            <mesh position={[0.3, 0.095, 0.277]}>
              <circleGeometry args={[0.045, 20]} />
              <meshBasicMaterial color={checked ? '#22b67a' : active ? '#29d9e6' : '#a5957f'} />
            </mesh>
            {checked && (
              <Html position={[0.43, 0.08, 0.29]} center style={{ pointerEvents: 'none' }}>
                <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">✓</span>
              </Html>
            )}
          </group>
        )
      })}
      <group ref={chassis} position={[-0.55, 0, 0.95]}>
        <Wheels length={0.65} width={0.6} radius={0.13} paused={paused || step.phase !== 0} speed={speed * 0.4} />
        <Block size={[0.87, 0.22, 0.67]} at={[0, 0.28, 0]} color="#2e3d49" />
        <Block size={[0.89, 0.18, 0.68]} at={[0, 0.46, 0]} color={color} />
        <Sensor at={[0.26, 0.6, 0.1]} />
        <Block size={[0.1, rows * 0.5 + 0.25, 0.12]} at={[0, 0.56 + (rows * 0.5 + 0.25) / 2, 0]} color="#c3cdd3" />
        <Block
          size={[0.024, rows * 0.5 + 0.2, 0.015]}
          at={[0, 0.56 + (rows * 0.5 + 0.2) / 2, -0.069]}
          color="#465965"
        />
        <group ref={head} position={[0, 0.75, 0]}>
          <Block size={[0.42, 0.23, 0.28]} color={color} />
          <Block size={[0.33, 0.16, 0.025]} at={[0, 0, -0.15]} color="#1a2e3d" />
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, -0.175]}>
              <cylinderGeometry args={[0.052, 0.052, 0.026, 24]} />
              <meshStandardMaterial
                color="#50e1ed"
                emissive="#167b90"
                emissiveIntensity={1}
                metalness={0.5}
                roughness={0.15}
              />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={beam} visible={false}>
        <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 1.16, 4, 1, true]} />
          <meshBasicMaterial color="#24cee7" transparent opacity={0.13} side={DoubleSide} depthWrite={false} />
        </mesh>
        <mesh ref={line} position={[0, 0, -0.36]}>
          <boxGeometry args={[0.43, 0.012, 0.008]} />
          <meshBasicMaterial color="#00e5f5" toneMapped={false} />
        </mesh>
      </group>
      <Html position={[0, 0.04, 1.65]} center style={{ pointerEvents: 'none', width: 250 }}>
        <div className="text-center text-[10px] text-ink-3">
          Подъезд → сканирование → учёт
          <br />
          Область считывания показана условно
        </div>
      </Html>
    </group>
  )
}
