import { ChevronRight } from 'lucide-react'
import { formatValue } from '@/shared/lib/format'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
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
            <CollapsibleContent className="space-y-3 pb-3 pl-7">
              <div className="space-y-1 rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
                <div className="text-muted-foreground">{step.formula}</div>
                <div className="font-medium text-foreground">{step.formula_rendered}</div>
              </div>
              {step.inputs.length > 0 && (
                <table className="w-full text-xs">
                  <tbody>
                    {step.inputs.map((input) => (
                      <tr key={input.key} className="border-t align-top first:border-t-0">
                        <td className="py-1.5 pr-3">
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
