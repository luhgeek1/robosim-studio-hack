import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { scenarioApi, useScenarios } from '@/entities/scenario'
import { qk } from '@/shared/api/keys'
import { problemText } from '@/shared/api/problem'
import type { Candidate, ScenarioItemWrite } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'

export function AddCandidateDialog({
  projectId,
  processKey,
  candidate,
}: {
  projectId: string
  processKey: string
  candidate: Candidate
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('new')
  const [name, setName] = useState('Мой вариант')
  const scenarios = useScenarios(projectId)
  const navigate = useNavigate()
  const cache = useQueryClient()
  const selected = scenarios.data?.find((s) => s.id === target)
  const replacing = selected?.items.find((i) => i.process_key === processKey)
  const add = useMutation({
    mutationFn: async () => {
      const item: ScenarioItemWrite = {
        process_key: processKey,
        product_id: candidate.product.id,
        offer_id: candidate.offer_id,
        count_mode: 'auto',
      }
      if (target === 'new')
        return scenarioApi.create(projectId, {
          name: name.trim(),
          kind: 'purchase',
          from_recommendation: false,
          items: [item],
        })
      // Read the latest composition before replacing one process; other processes retain all their settings.
      const current = await scenarioApi.get(target)
      const items: ScenarioItemWrite[] = current.items
        .filter((i) => i.process_key !== processKey)
        .map((i) => ({
          process_key: i.process_key,
          product_id: i.product_id,
          offer_id: i.offer_id,
          count_mode: i.count_mode,
          count_manual: i.count_manual,
          stations: i.stations,
          notes: i.notes,
          price_override_rub: i.price_override_rub,
          throughput_override_per_hour: i.throughput_override_per_hour,
          override_reason: i.override_reason,
        }))
      return scenarioApi.update(target, { items: [...items, item] })
    },
    onSuccess: async (scenario) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
        cache.invalidateQueries({ queryKey: qk.projects.list }),
        cache.invalidateQueries({ queryKey: qk.scenarios.all }),
      ])
      setOpen(false)
      navigate(`/projects/${projectId}/scenarios/${scenario.id}?edit=1`)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!add.isPending) {
          setOpen(value)
          add.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Plus /> В свой сценарий
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Добавить «{candidate.product.name}»</DialogTitle>
          <DialogDescription>
            Выберите сценарий. Состав сохранится; количество и экономику можно настроить на следующем экране.
          </DialogDescription>
        </DialogHeader>
        {scenarios.isPending && <LoadingBlock />}
        {scenarios.isError && <ErrorBlock error={scenarios.error} onRetry={() => scenarios.refetch()} />}
        {scenarios.data && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Сценарий</Label>
              <Select value={target} onValueChange={setTarget} disabled={add.isPending}>
                <SelectTrigger className="w-full" aria-label="Сценарий для решения">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Новый сценарий покупки</SelectItem>
                  {scenarios.data
                    .filter((s) => !s.is_baseline)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {target === 'new' && (
              <div className="space-y-2">
                <Label htmlFor="custom-scenario-name">Название</Label>
                <Input
                  id="custom-scenario-name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  disabled={add.isPending}
                />
              </div>
            )}
            {replacing && (
              <p className="text-sm text-warn">
                В этом процессе уже есть «{replacing.product_name}». Оно будет заменено: один процесс рассчитывается с
                одним типом решения.
              </p>
            )}
            {candidate.estimate?.sizing_issue && (
              <p className="text-sm text-warn">
                {candidate.estimate.sizing_issue} В сценарии потребуется своё количество или производительность.
              </p>
            )}
            {add.isError && (
              <p role="alert" className="text-sm text-crit">
                {problemText(add.error)}
              </p>
            )}
            <Button
              onClick={() => add.mutate()}
              disabled={add.isPending || (target === 'new' ? !name.trim() : !selected)}
            >
              {add.isPending && <Spinner />}
              {replacing ? 'Заменить и открыть сценарий' : 'Добавить и открыть сценарий'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
