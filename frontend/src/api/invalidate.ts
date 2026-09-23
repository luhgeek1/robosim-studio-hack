import { useQueryClient } from '@tanstack/react-query'
import { qk } from './keys'

// Any change to the object bumps the project version: params, processes, layout, matching and calculations all move.
export function useInvalidateProject() {
  const queryClient = useQueryClient()
  return (projectId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projects.list }),
      queryClient.invalidateQueries({ queryKey: qk.scenarios.all }),
    ])
}
