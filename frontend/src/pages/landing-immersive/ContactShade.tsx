import { useEffect, useMemo } from 'react'
import { CanvasTexture } from 'three'

export function ContactShade() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(7, 16, 11, 0.85)')
    gradient.addColorStop(0.5, 'rgba(7, 16, 11, 0.5)')
    gradient.addColorStop(1, 'rgba(7, 16, 11, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
    return new CanvasTexture(canvas)
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.45, 1, 1]}>
      <planeGeometry args={[4.8, 4.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}
