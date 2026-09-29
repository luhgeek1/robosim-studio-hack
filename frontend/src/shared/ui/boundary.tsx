import { Component, type ReactNode } from 'react'

/* WebGL may be unavailable (a VM, a laptop without GPU, blocked hardware acceleration): react-three-fiber then
   throws while mounting the canvas. The boundary keeps the error inside the scene, the page around it works. */
export class SceneBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      this.props.fallback ?? (
        <div className="grid h-full place-items-center p-4 text-center text-[12.5px] text-ink-3">
          3D недоступно в этом браузере
        </div>
      )
    )
  }
}
