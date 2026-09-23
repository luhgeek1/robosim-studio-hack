import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router'
import { useProject, useProjectId } from '@/entities/project'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

export function ProjectLayout() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-7">
      {project.isPending && <LoadingBlock label="Открываем проект…" />}
      {project.isError && <ErrorBlock error={project.error} onRetry={() => project.refetch()} />}
      {project.data && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
