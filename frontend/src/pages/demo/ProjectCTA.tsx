import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import type { DemoSnapshot } from '@/entities/demo/api'
import { projectApi } from '@/entities/project/api'
import { useSession } from '@/entities/session'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Section } from '@/shared/ui/page'
import { Spinner } from '@/shared/ui/states'

export function ProjectAction({ demo }: { demo: DemoSnapshot }) {
  const { status } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const project = await projectApi.create({
        name: demo.demo.name,
        object_type: demo.demo.object_type,
        init: { mode: 'demo', demo_key: demo.demo.key },
      })
      navigate(`/projects/${project.id}/object`)
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(false)
    }
  }
  if (status !== 'authenticated')
    return (
      <Button asChild className="h-auto min-h-8 max-w-full whitespace-normal">
        <Link to="/login?mode=register" state={{ from: `/demo/${demo.demo.key}?step=report` }}>
          Зарегистрироваться и создать проект
          <ArrowUpRight />
        </Link>
      </Button>
    )
  return (
    <>
      <Button className="h-auto min-h-8 max-w-full whitespace-normal" onClick={() => void create()} disabled={busy}>
        {busy && <Spinner />}
        {busy ? 'Создаём проект…' : 'Создать свой проект'}
        <ArrowUpRight />
      </Button>
      {error && (
        <p className="mt-2 text-[13px] text-crit" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export function FullAccess({ demo }: { demo: DemoSnapshot }) {
  return (
    <Section
      title="Продолжить со своим объектом"
      description="Тот же рабочий интерфейс, с полным набором возможностей."
    >
      <ul className="list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-ink-2">
        <li>Свои параметры, импорт Excel и редактирование планировки.</li>
        <li>Выбор роботов, отдельные сценарии и сравнение вариантов.</li>
        <li>Риски, стресс-тесты, собственные прогоны и сохранение проектов.</li>
      </ul>
      <div className="mt-5">
        <ProjectAction demo={demo} />
      </div>
      <p className="meta mt-3">
        Личный проект начнётся с исходных данных этого примера. Пробные изменения не переносятся.
      </p>
    </Section>
  )
}
