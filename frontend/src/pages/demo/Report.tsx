import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { Download, ArrowUpRight } from 'lucide-react'
import { useSession } from '@/entities/session'
import { projectApi } from '@/entities/project/api'
import type { DemoSnapshot } from '@/entities/demo/api'
import { apiPublic } from '@/shared/api/client'
import { problemText } from '@/shared/api/problem'
import { formatDateTime } from '@/shared/lib/format'

export function Report({ demo, changed }: { demo: DemoSnapshot; changed: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { status } = useSession()
  const navigate = useNavigate()
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(null)
    }
  }
  const download = (format: 'pdf' | 'xlsx') =>
    run(format, async () => {
      const response = await apiPublic.get<Blob>(`/demo/projects/${demo.demo.key}/report/${format}`, {
        responseType: 'blob',
        params: { revision: demo.revision },
      })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `Робомера_${demo.demo.key}.${format}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  const create = () =>
    run('create', async () => {
      const project = await projectApi.create({
        name: demo.demo.name,
        object_type: demo.demo.object_type,
        init: { mode: 'demo', demo_key: demo.demo.key },
      })
      navigate(`/projects/${project.id}/object`)
    })
  return (
    <section className="demo-panel demo-report">
      <div className="demo-eyebrow">РЕЗУЛЬТАТ МОЖНО ЗАБРАТЬ С СОБОЙ</div>
      <h2>Отчёт, который можно проверить</h2>
      <p>
        Исходные параметры, выбранные решения, состав затрат, четыре варианта экономики, имитация, источники и допущения
        — в одном документе.
      </p>
      <div className="demo-notice">
        {changed ? 'Вы меняли условия. ' : ''}PDF и Excel относятся к исходному примеру. Пробные изменения в них не
        входят.
      </div>
      <div className="demo-actions">
        <button className="demo-button" disabled={!!busy} onClick={() => void download('pdf')}>
          <Download size={17} />
          {busy === 'pdf' ? 'Готовим PDF…' : 'Скачать PDF'}
        </button>
        <button className="demo-button demo-button-secondary" disabled={!!busy} onClick={() => void download('xlsx')}>
          <Download size={17} />
          {busy === 'xlsx' ? 'Готовим Excel…' : 'Excel с формулами'}
        </button>
      </div>
      <p className="demo-small">
        Пример рассчитан {formatDateTime(demo.prepared_at)}. Ядро {demo.calculations[0].versions.engine_version}.
        Предварительная оценка, требующая обследования объекта.
      </p>
      <hr />
      <h3>Теперь — ваш объект</h3>
      <p>
        Создайте личный проект с исходными данными этого примера. Замените параметры своими, выполните подбор и
        запустите собственную имитацию. Пробные изменения гостя не переносятся.
      </p>
      {status === 'authenticated' ? (
        <button className="demo-button" disabled={!!busy} onClick={() => void create()}>
          {busy === 'create' ? 'Создаём проект…' : 'Создать проект по исходному примеру'}
          <ArrowUpRight size={17} />
        </button>
      ) : (
        <Link className="demo-button" to="/login" state={{ from: `/demo/${demo.demo.key}?step=report` }}>
          Войти или зарегистрироваться для своего проекта
          <ArrowUpRight size={17} />
        </Link>
      )}
      {error && (
        <p className="demo-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
