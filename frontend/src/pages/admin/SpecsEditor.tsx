import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSpecKeys, useUpsertSpecs } from '@/entities/admin'
import type { ProductDetail } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { SPRING } from './motion'
import { SourceFields, SpecsList } from './SpecsForm'
import { changedEdits, emptySource, toSpecWrites, type SpecEdit, type SpecEdits } from './specs'

export function SpecsEditor({ product }: { product: ProductDetail }) {
  const specKeys = useSpecKeys()
  const upsert = useUpsertSpecs()
  const [edits, setEdits] = useState<SpecEdits>({})
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [source, setSource] = useState(emptySource)
  const changed = changedEdits(edits)

  const edit = (key: string, patch: Partial<SpecEdit>) =>
    setEdits((prev) => {
      const base: SpecEdit = prev[key] ?? { text: '', status: 'confirmed' }
      return { ...prev, [key]: { ...base, ...patch } }
    })

  const save = () => {
    const specs = toSpecWrites(edits, source, specKeys.data)
    upsert.mutate(
      { id: product.id, specs },
      {
        onSuccess: () => {
          toast.success(
            `Сохранено ${specs.length} ${pluralRu(specs.length, ['характеристика', 'характеристики', 'характеристик'])}`,
          )
          setEdits({})
        },
      },
    )
  }

  if (specKeys.isPending) return <LoadingBlock label="Загружаем словарь характеристик…" />

  return (
    <div className="pb-20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="meta max-w-sm">
          Каждое значение сохраняется с источником и датой (ТЗ 3.3.3). Ключевые ТТХ участвуют в проверках подбора.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-2">
          <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} size="sm" /> только пустые
        </label>
      </div>

      <SpecsList
        product={product}
        specKeys={specKeys.data ?? []}
        edits={edits}
        onEdit={edit}
        onlyMissing={onlyMissing}
      />

      <AnimatePresence>
        {changed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={SPRING}
            className="sticky bottom-0 -mx-6 mt-5 border-t border-line bg-card/95 px-6 pt-4 pb-5 backdrop-blur"
          >
            <SourceFields source={source} onChange={setSource} />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdits({})}>
                Сбросить
              </Button>
              <Button onClick={save} disabled={!source.title.trim() || upsert.isPending}>
                {upsert.isPending && <Spinner />} Сохранить {changed.length}{' '}
                {pluralRu(changed.length, ['значение', 'значения', 'значений'])}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
