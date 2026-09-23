import { useState } from 'react'
import type { Candidate } from '@/api/types'
import { Button, Field, Modal, inputCls } from '@/components/ui'
import { shortName } from './model'

// Solution types without a sizing model (pick-by-voice, sorting robots, arms) fail the calculation on an automatic
// count, so the scenario gets them only with a count the user entered (ТЗ 3.5.4: manual correction is recorded).
export function CountModal({
  candidate,
  pending,
  onCancel,
  onConfirm,
}: {
  candidate: Candidate | null
  pending: boolean
  onCancel: () => void
  onConfirm: (count: number) => void
}) {
  return (
    <Modal
      open={Boolean(candidate)}
      onClose={onCancel}
      width={480}
      title={candidate ? `Сколько единиц «${shortName(candidate.product.name)}» нужно?` : ''}
      lead="Для этого типа решений нет модели расчёта количества по спросу, поэтому число задаёте вы. В расчёте оно будет отмечено как заданное вручную; изменить его можно при настройке сценария на шаге «Экономика»."
    >
      {candidate && (
        <CountForm key={candidate.product.id} pending={pending} onCancel={onCancel} onConfirm={onConfirm} />
      )}
    </Modal>
  )
}

function CountForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (count: number) => void
}) {
  const [text, setText] = useState('')
  const count = Number(text)
  const valid = text !== '' && Number.isInteger(count) && count >= 1
  const submit = () => valid && !pending && onConfirm(count)
  return (
    <>
      <Field label="Количество, шт." hint="Целое число от 1 — например, по числу рабочих мест, линий или смен">
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-invalid={text !== '' && !valid}
          className={inputCls}
        />
      </Field>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" disabled={!valid || pending} onClick={submit}>
          {pending ? 'Сохраняем…' : 'Добавить в сценарий'}
        </Button>
      </div>
    </>
  )
}
