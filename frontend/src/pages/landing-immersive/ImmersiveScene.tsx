import { useEffect, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Color, MathUtils, PCFShadowMap, Vector3 } from 'three'
import { Warehouse } from './Warehouse'
import { blend, type ImmersiveSignal } from './scene-state'

type Props = {
  signalRef: RefObject<ImmersiveSignal>
  invalidateRef: RefObject<(() => void) | null>
  onReady: () => void
  onFailure: () => void
}
const target = new Vector3()
const night = new Color('#171d1e')

function World({ signalRef, invalidateRef, onReady, onFailure }: Props) {
  const { invalidate, gl } = useThree()
  const readyRef = useRef(false)
  useEffect(() => {
    invalidateRef.current = invalidate
    const fail = (event: Event) => {
      event.preventDefault()
      onFailure()
    }
    gl.domElement.addEventListener('webglcontextlost', fail)
    return () => {
      invalidateRef.current = null
      gl.domElement.removeEventListener('webglcontextlost', fail)
    }
  }, [gl, invalidate, invalidateRef, onFailure])
  useFrame(({ camera, scene }) => {
    const { progress: p, compact } = signalRef.current
    const rise = blend(p, 0.1, 0.64)
    const dock = blend(p, 0.63, 0.94)
    camera.position.set(
      MathUtils.lerp(0, 23 - dock * 5, rise),
      MathUtils.lerp(compact ? 3.8 : 2.35, 27 - dock * 5, rise),
      MathUtils.lerp(compact ? 20 : 15, 34 - dock * 6, rise),
    )
    target.set(MathUtils.lerp(0, -9.5 + dock * 9.5, rise), MathUtils.lerp(2.2, 0, rise), -4)
    camera.lookAt(target)
    scene.background = night
    if (!readyRef.current) {
      readyRef.current = true
      requestAnimationFrame(onReady)
    }
  })
  return (
    <>
      <ambientLight intensity={0.5} color="#c7d5c9" />
      <hemisphereLight args={['#dbe5dc', '#303e34', 1.1]} />
      <directionalLight
        position={[-9, 17, 8]}
        intensity={3.3}
        color="#fff0d3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-normalBias={0.025}
        shadow-bias={-0.0001}
        shadow-radius={4}
      />
      <directionalLight position={[9, 7, -14]} intensity={1.6} color="#d5e9e7" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} position={[0, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 20, 1]} />
        <Lightformer
          form="rect"
          intensity={2}
          position={[-10, 5, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[6, 15, 1]}
        />
      </Environment>
      <Warehouse signalRef={signalRef} />
    </>
  )
}

export default function ImmersiveScene(props: Props) {
  return (
    <Canvas
      resize={{ offsetSize: true, scroll: false }}
      camera={{ position: [0, 2.35, 15], fov: 50, near: 0.1, far: 160 }}
      dpr={[1, 1.5]}
      shadows={{ type: PCFShadowMap }}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <World {...props} />
    </Canvas>
  )
}
