import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Layout } from '@/shared/api/types'
import { saveBlob } from '@/shared/lib/download'
import { formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Spinner } from '@/shared/ui/states'
import { derivationDocument } from './derivationDoc'
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
              <div className="space-y-1 rounded-md bg-raised p-3 font-mono text-xs leading-relaxed">
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

export function Derivation({ layout, projectName }: { layout: Layout; projectName: string }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const download = async () => {
    setSaving(true)
    try {
      const blob = await derivationDocument(layout, projectName)
      saveBlob(blob, `геометрия-планировки-${layout.version}.docx`)
    } catch {
      toast.error('Не удалось собрать документ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6 rounded-lg border bg-surface">
      <div className="flex items-center gap-3 pr-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center justify-between px-5 py-3 text-left">
          <div>
            <div className="text-[15px] font-semibold">Как получена геометрия</div>
            <div className="text-xs text-muted-foreground">
              {layout.derivation.length} шагов: каждый размер — формула из параметров объекта и нормативов
            </div>
          </div>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <Button variant="outline" size="sm" onClick={() => void download()} disabled={saving}>
          {saving ? <Spinner /> : <FileText />} Скачать документ
        </Button>
      </div>
      <CollapsibleContent className="border-t px-5 pb-3">
        <DerivationList steps={layout.derivation} />
      </CollapsibleContent>
    </Collapsible>
  )
}
