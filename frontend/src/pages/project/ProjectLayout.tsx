import { Outlet, useLocation } from 'react-router'
import { useProject, useProjectId } from '@/entities/project'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

export function ProjectLayout() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
      {project.isPending && <LoadingBlock label="Открываем проект…" />}
      {project.isError && <ErrorBlock error={project.error} onRetry={() => project.refetch()} />}
      {project.data && (
        /* Only an enter animation, in CSS: AnimatePresence with mode="wait" held the next screen until the old one
           finished its exit, and leaving the 3D twin (WebGL teardown) could leave the step blank at opacity 0.
           A CSS animation with no fill mode always ends on the visible element. */
        <div
          key={pathname}
          className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-2.5 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <Outlet />
        </div>
      )}
    </div>
  )
}
