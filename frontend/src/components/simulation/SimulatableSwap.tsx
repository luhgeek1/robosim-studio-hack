import { ArrowRightLeft } from 'lucide-react'
import { useChooseProduct, useMatching } from '@/api/matching'
import type { Scenario } from '@/api/types'
import { Button } from '@/components/ui'

// Solution types whose sizing model the event simulation reproduces: single-load transport trips and goods-to-person.
const SIMULATED_TYPES = new Set(['amr_transport', 'fmr_forklift', 'autonomous_truck', 'goods_to_person'])

type Props = {
  projectId: string
  scenario: Scenario
  processKey: string
  busy: boolean
  onSwapped: () => void
}

export function SimulatableSwap({ projectId, scenario, processKey, busy, onSwapped }: Props) {
  const matching = useMatching(projectId).data
  const choose = useChooseProduct(projectId)
  const item = scenario.items.find((i) => i.process_key === processKey)
  const candidates = matching?.processes.find((p) => p.process_key === processKey)?.candidates ?? []
  const current = candidates.find((c) => c.product.id === item?.product_id)
  if (!item || !current || SIMULATED_TYPES.has(current.product.solution_type)) return null

  const usable = candidates.filter((c) => c.status !== 'excluded' && SIMULATED_TYPES.has(c.product.solution_type))
  const alternative =
    usable.filter((c) => c.rank != null).sort((a, b) => a.rank! - b.rank!)[0] ??
    usable.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]

  const swap = async () => {
    if (!alternative) return
    const done = await choose
      .mutateAsync({ processKey, productId: alternative.product.id, offerId: alternative.offer_id ?? null })
      .catch(() => null)
    if (done) onSwapped()
  }

  return (
    <div className="card mb-4 space-y-3 p-5">
      <div className="text-[15px] font-medium">
        «{item.product_name}» — {current.product.solution_type_name?.toLowerCase() ?? 'этот тип роботов'}, его имитация
        пока не воспроизводит
      </div>
      <p className="text-[13px] text-ink-3">
        {current.product.solution_type === 'tow_tractor' && 'Тягач везёт сразу несколько паллет на тележках. '}
        Имитация сейчас строится для одиночных рейсов транспортных роботов и для «товар к человеку», поэтому число
        роботов остаётся по расчёту времени цикла — его видно на шаге «Экономика».
        {alternative &&
          ` Чтобы проверить парк имитацией, можно взять лучший из подходящих транспортных роботов по подбору: «${alternative.product.name}».`}
      </p>
      {alternative && (
        <Button icon={<ArrowRightLeft size={15} />} onClick={() => void swap()} disabled={busy || choose.isPending}>
          {choose.isPending ? 'Меняем робота…' : `Взять «${alternative.product.name}» и подобрать число имитацией`}
        </Button>
      )}
    </div>
  )
}
