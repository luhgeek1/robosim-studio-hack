import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useProject } from '@/api/projects'
import { useSession } from '@/api/sessionContext'
import { Toasts, TraceDrawer, TrustDrawer } from '@/components/Overlays'
import { ProductDrawer } from '@/components/ProductDrawer'
import { ErrorState, Loading } from '@/components/States'
import { TopBar } from '@/components/TopBar'
import { useProjectId } from '@/lib/story'

export function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <TrustDrawer />
      <TraceDrawer />
      <ProductDrawer />
      <Toasts />
    </div>
  )
}

export function RequireAuth() {
  const { status } = useSession()
  const location = useLocation()
  if (status === 'restoring')
    return (
      <div className="mx-auto max-w-[1100px] px-6 pt-12">
        <Loading label="Восстанавливаем сессию…" />
      </div>
    )
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RootRedirect() {
  const { status } = useSession()
  if (status === 'restoring') return null
  return <Navigate to={status === 'authenticated' ? '/projects' : '/catalog'} replace />
}

export function ProjectGate() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  if (project.isPending)
    return (
      <div className="mx-auto max-w-[1200px] px-6 pt-9">
        <Loading label="Открываем проект…" />
      </div>
    )
  if (project.isError)
    return (
      <div className="mx-auto max-w-[1200px] px-6 pt-9">
        <ErrorState error={project.error} onRetry={() => project.refetch()} title="Проект не открылся" />
      </div>
    )
  return <Outlet />
}
