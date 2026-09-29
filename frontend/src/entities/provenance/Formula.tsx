import type { TraceInput } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { ProvenanceBadge } from './ProvenanceBadge'

const INPUT_KIND_LABEL: Record<NonNullable<TraceInput['kind']>, string> = {
  param: 'параметр объекта',
  norm: 'норматив',
  spec: 'ТТХ / каталог',
  metric: 'промежуточный итог',
  simulation: 'имитация',
  layout: 'планировка',
}

export function Formula({
  formula,
  rendered,
  inputs,
  note,
}: {
  formula: string
  rendered?: string | null
  inputs?: TraceInput[]
  note?: string | null
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-md bg-raised p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
        <div className="text-muted-foreground">{formula}</div>
        {rendered && <div className="font-medium text-foreground">{rendered}</div>}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {inputs && inputs.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {inputs.map((input) => (
              <tr key={input.key} className="border-t align-top first:border-t-0">
                <td className="py-1.5 pr-3">
                  <div>{input.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                    {input.key}
                    {input.kind && ` · ${INPUT_KIND_LABEL[input.kind]}`}
                  </div>
                  {/* На телефоне происхождение уходит под название: третьей колонке не хватает ширины. */}
                  <ProvenanceBadge provenance={input.provenance} className="mt-0.5 sm:hidden" />
                </td>
                <td className="num py-1.5 pr-3 text-right font-medium whitespace-nowrap">
                  {formatValue(input.value, input.unit)}
                </td>
                <td className="py-1.5 text-right max-sm:hidden">
                  <ProvenanceBadge provenance={input.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
