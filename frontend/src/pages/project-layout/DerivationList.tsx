import { ChevronRight, FileText } from 'lucide-react'
import type { Layout } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Spinner } from '@/shared/ui/states'
import { useDerivationDownload } from './useDerivationDownload'
import { DERIVATION_INPUT_KIND_LABEL, type LayoutDerivationStep } from './labels'

export function DerivationList({ steps }: { steps: LayoutDerivationStep[] }) {
  return (
    <ul className="divide-y">
      {steps.map((step) => (
        <li key={step.key}>
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center gap-3 py-2 text-left hover:text-primary">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              <span className="min-w-0 flex-1">{step.name}</span>
              <span className="num font-medium whitespace-nowrap">{formatValue(step.value, step.unit)}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pb-3 pl-0 sm:pl-7">
              <div className="space-y-1 rounded-md bg-raised p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
                <div className="text-muted-foreground">{step.formula}</div>
                <div className="font-medium text-foreground">{step.formula_rendered}</div>
              </div>
              {step.inputs.length > 0 && (
                <table className="w-full text-xs">
                  <tbody>
                    {step.inputs.map((input) => (
                      <tr key={input.key} className="border-t align-top first:border-t-0">
                        <td className="py-1.5 pr-3 [overflow-wrap:anywhere]">
                          <div>{input.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {input.key} · {DERIVATION_INPUT_KIND_LABEL[input.kind] ?? input.kind}
                          </div>
                        </td>
                        <td className="num py-1.5 text-right font-medium whitespace-nowrap">
                          {formatValue(input.value, input.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CollapsibleContent>
          </Collapsible>
        </li>
      ))}
    </ul>
  )
}

/* Нижняя панель рабочей области планировки: шаги вывода геометрии с формулами и выгрузка документом Word. */

/* Под рабочей областью, по прокрутке: шаги вывода геометрии с формулами и выгрузка документом Word. */
export function DerivationSection({ layout, projectName }: { layout: Layout; projectName: string }) {
  const { saving, download } = useDerivationDownload(layout, projectName)
  return (
    <section id="layout-derivation" className="mx-auto w-full max-w-300 scroll-mt-32 pt-10 pb-16">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="hud mb-2 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            Вывод геометрии · {layout.derivation.length} шагов
          </div>
          <h2 className="h2">Как получена геометрия</h2>
          <p className="mt-1 text-[14px] text-ink-3">
            Каждый размер схемы — формула из параметров объекта и нормативов; раскройте шаг, чтобы увидеть входы.
          </p>
        </div>
        <Button variant="outline" onClick={() => void download()} disabled={saving}>
          {saving ? <Spinner /> : <FileText />} Скачать документ
        </Button>
      </div>
      <div className="card px-4 py-2 sm:px-5">
        <DerivationList steps={layout.derivation} />
      </div>
    </section>
  )
}
