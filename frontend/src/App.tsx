import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from './components/TopBar'
import { ConfidenceDrawer, RobotDetails, Toasts } from './components/Overlays'
import { useStore } from './store'
import { useSimulationLoop } from './sim/useSimulationLoop'
import { api } from './api'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { ObjectScreen } from './screens/ObjectScreen'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { RobotsScreen } from './screens/RobotsScreen'
import { SimulationScreen } from './screens/SimulationScreen'
import { EconomicsScreen } from './screens/EconomicsScreen'
import { VerdictScreen } from './screens/VerdictScreen'

const screens = {
  projects: ProjectsScreen,
  object: ObjectScreen,
  analysis: AnalysisScreen,
  robots: RobotsScreen,
  simulation: SimulationScreen,
  economics: EconomicsScreen,
  verdict: VerdictScreen,
}

export default function App() {
  useSimulationLoop()
  const step = useStore((s) => s.step)
  const project = useStore((s) => s.project)
  const [backendDown, setBackendDown] = useState(false)
  useEffect(() => {
    api.health().then(() => setBackendDown(false)).catch(() => setBackendDown(true))
  }, [step])
  const Current = step !== 'projects' && !project ? ProjectsScreen : screens[step]
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      {backendDown && (
        <div className="border-b border-crit/20 bg-crit-soft px-6 py-2 text-center text-[13px] text-crit">
          Сервер расчётов недоступен. Запустите backend: <code className="rounded bg-white/60 px-1">cd backend && .venv/bin/uvicorn app.main:app --port 8000</code>
        </div>
      )}
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>
      <ConfidenceDrawer />
      <RobotDetails />
      <Toasts />
    </div>
  )
}
