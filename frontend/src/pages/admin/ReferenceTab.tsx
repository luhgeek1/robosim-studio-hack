import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router'
import { Segmented } from '@/shared/ui/v0'
import { DefaultsPane } from './DefaultsPane'
import { SourcesPane } from './SourcesPane'

type View = 'defaults' | 'sources'
const HINT: Record<View, string> = {
  defaults:
    'Значения, которые подставляются в проект, пока пользователь не ввёл своё. Каждое — с источником и обоснованием (ТЗ 2.1.6, 3.1.4).',
  sources:
    'Откуда взяты цены, ТТХ, нормативы и значения по умолчанию: ссылка, дата получения и сколько значений опирается на источник (ТЗ 3.3.4).',
}

export function ReferenceTab() {
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'sources' ? 'sources' : 'defaults'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Segmented
          value={view}
          onChange={(next) => setParams(next === 'defaults' ? {} : { view: next }, { replace: true })}
          options={[
            { value: 'defaults', label: 'Параметры по умолчанию' },
            { value: 'sources', label: 'Источники данных' },
          ]}
        />
        <p className="meta max-w-xl">{HINT[view]}</p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === 'defaults' ? <DefaultsPane /> : <SourcesPane />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
