import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from './components/TopBar'
import { ConfidenceDrawer, RobotDetails, Toasts } from './components/Overlays'
import { useStore } from './store'
import { useSimulationLoop } from './sim/useSimulationLoop'
import { ObjectScreen } from './screens/ObjectScreen'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { RobotsScreen } from './screens/RobotsScreen'
import { SimulationScreen } from './screens/SimulationScreen'
import { EconomicsScreen } from './screens/EconomicsScreen'
import { VerdictScreen } from './screens/VerdictScreen'

const screens = {
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
  const Current = screens[step]
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
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
