import { useParams } from 'react-router'

export function useProjectId(): string {
  const { projectId } = useParams()
  if (!projectId) throw new Error('useProjectId must be used under /projects/:projectId')
  return projectId
}
