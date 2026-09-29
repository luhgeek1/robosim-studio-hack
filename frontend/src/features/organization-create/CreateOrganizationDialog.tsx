import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useCreateOrganization, useWorkspaceStore } from '@/entities/organization'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'

/* Новая организация сразу становится текущей рабочей областью, а пользователь попадает к приглашениям —
   без участников она бессмысленна. */
export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState('')
  const create = useCreateOrganization()
  const select = useWorkspaceStore((s) => s.select)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const organization = await create.mutateAsync(name.trim())
    select(organization.id)
    setName('')
    onOpenChange(false)
    navigate(`/organizations/${organization.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Новая организация</DialogTitle>
            <DialogDescription>
              Общее пространство команды: проекты в нём видят и редактируют все участники. Коллег пригласите по email на
              следующем шаге.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="organization-name">Название</Label>
            <Input
              id="organization-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: ООО «Логистика Север»"
              maxLength={120}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && <Spinner />} Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
