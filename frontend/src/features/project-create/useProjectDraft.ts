import { useState } from 'react'
import { useWorkspace } from '@/entities/organization'
import { OBJECT_TYPE_LABEL, useCreateProject } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey } from '@/shared/api/types'

export type InitMode = 'demo' | 'blank'

export function useProjectDraft(initialMode: InitMode = 'demo') {
  const objectTypes = useObjectTypes()
  const create = useCreateProject()
  const workspace = useWorkspace()
  const [objectType, setObjectType] = useState<ObjectTypeKey>('warehouse')
  const [preferredMode, setMode] = useState<InitMode>(initialMode)
  const [name, setName] = useState('')
  const [demoKey, setDemoKey] = useState<string | null>(null)
  const selected = objectTypes.data?.find((t) => t.key === objectType)
  const demos = selected?.demo_projects ?? []
  const demo = demos.find((d) => d.key === demoKey) ?? demos[0]
  const mode: InitMode = demo ? preferredMode : 'blank'
  const defaultName = mode === 'demo' && demo ? demo.name : `Новый объект: ${OBJECT_TYPE_LABEL[objectType]}`

  const submit = () => {
    if (create.isPending || !selected) return
    return create.mutateAsync({
      name: name.trim() || defaultName,
      object_type: objectType,
      init: mode === 'demo' && demo ? { mode: 'demo', demo_key: demo.key } : { mode: 'blank' },
      organization_id: workspace.id,
    })
  }

  return {
    objectTypes,
    create,
    workspace,
    objectType,
    setObjectType,
    mode,
    setMode,
    name,
    setName,
    setDemoKey,
    selected,
    demos,
    demo,
    defaultName,
    submit,
  }
}
