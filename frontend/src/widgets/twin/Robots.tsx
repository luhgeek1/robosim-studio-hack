import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { makeAgent, stepAgent, type Agent } from './agents'
import { DOCK_POINTS } from './layout'
import { RobotMesh } from './RobotMesh'
import { useTwin } from './store'

export const MAX_ROBOTS = 12

export const agentsRef: { current: Agent[] } = { current: [] }

const TASK_LABEL: Record<Agent['task'], string> = {
  toReceiving: 'едет на приёмку',
  toStorage: 'везёт паллету на хранение',
  toPicking: 'едет на комплектацию',
  toShipping: 'везёт заказ на отгрузку',
  returning: 'возвращается',
  idle: 'ожидает задачу',
}

export function robotStatus(i: number) {
  const a = agentsRef.current[i]
  if (!a) return { task: '—', loaded: false }
  const running = useTwin.getState().running
  return { task: running ? TASK_LABEL[a.task] : 'на паузе', loaded: a.loaded }
}

function RobotAgent({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null)
  const scaleRef = useRef(0)
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState(true)
  const selection = useTwin((s) => s.selection)
  const setSelection = useTwin((s) => s.setSelection)
  const selected = selection?.kind === 'robot' && selection.index === index
  const agent = useMemo(() => {
    const a = makeAgent(index)
    agentsRef.current[index] = a
    return a
  }, [index])

  useFrame((_, rawDt) => {
    const dt = Math.min(0.12, rawDt)
    const s = useTwin.getState()
    const active = index < s.robotCount
    const target = active ? 1 : 0
    scaleRef.current += (target - scaleRef.current) * Math.min(1, dt * 6)
    if (!active && scaleRef.current < 0.02) {
      // Снятые роботы паркуются у доков, чтобы при возврате появляться из осмысленного места.
      const d = DOCK_POINTS[index % DOCK_POINTS.length]
      agent.pos = [d[0], d[1]]
      agent.path = []
      agent.task = 'idle'
      agent.loaded = false
      agent.idleFor = 0.4
      if (visible) setVisible(false)
    } else if (!visible && active) setVisible(true)

    if (active && s.running) {
      const util = s.live.utilization / 100
      const speedMul = s.loadMode === 'peak' ? 1.15 : 1
      stepAgent(agent, dt, util, speedMul)
    }
    if (agent.loaded !== loaded) setLoaded(agent.loaded)
    if (group.current) {
      group.current.position.set(agent.pos[0], 0, agent.pos[1])
      group.current.rotation.y = agent.heading
      const sc = scaleRef.current
      group.current.scale.set(sc, sc, sc)
    }
  })

  const running = useTwin((s) => s.running)
  return (
    <group
      ref={group}
      visible={visible}
      onClick={(e) => {
        if (e.delta > 4) return
        e.stopPropagation()
        setSelection(selected ? null : { kind: 'robot', index })
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <RobotMesh loaded={loaded} active={running && agent.task !== 'idle'} selected={selected} />
      {selected && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="twin-label rounded-[10px] border border-line bg-white/95 px-3 py-2 text-left shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <div className="text-[12.5px] font-semibold text-ink">Робот {index + 1}</div>
            <div className="text-[12px] text-ink-3">{running ? TASK_LABEL[agent.task] : 'на паузе'}</div>
          </div>
        </Html>
      )}
    </group>
  )
}

export function Robots() {
  return (
    <group>
      {Array.from({ length: MAX_ROBOTS }, (_, i) => (
        <RobotAgent key={i} index={i} />
      ))}
    </group>
  )
}
