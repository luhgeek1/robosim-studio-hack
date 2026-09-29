import { View } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ArrowUpRight, Pause, Play, PersonStanding, RotateCw } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import * as THREE from 'three'
import { useProduct } from '@/entities/catalog'
import type { Product } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Segmented } from '@/shared/ui/v0'
import {
  GROUPS,
  FALLBACK_KIND,
  KINDS,
  Studio,
  cleanName,
  kindOf,
  orderForKind,
  useCatalogProducts,
  useGallery,
  variantFromProduct,
  type DragState,
  type Kind,
  type Spec,
  type Variant,
} from '@/widgets/robot-3d'

const nf = (x: number, digits = 0) => x.toLocaleString('ru-RU', { maximumFractionDigits: digits })

function specRows(spec: Spec): { key: keyof Spec; label: string; value: string }[] {
  const rows: { key: keyof Spec; label: string; value: string }[] = []
  if (spec.dims_mm)
    rows.push({ key: 'dims_mm', label: 'Габариты', value: `${spec.dims_mm.map((d) => nf(d)).join(' × ')} мм` })
  if (spec.payload_kg) rows.push({ key: 'payload_kg', label: 'Грузоподъёмность', value: `${nf(spec.payload_kg)} кг` })
  if (spec.tow_kg) rows.push({ key: 'tow_kg', label: 'Буксируемая масса', value: `${nf(spec.tow_kg)} кг` })
  if (spec.speed_mps) rows.push({ key: 'speed_mps', label: 'Скорость', value: `${nf(spec.speed_mps, 1)} м/с` })
  if (spec.lift_mm)
    rows.push({
      key: 'lift_mm',
      label: 'Высота подъёма',
      value: spec.lift_min_mm ? `${nf(spec.lift_min_mm)}–${nf(spec.lift_mm)} мм` : `${nf(spec.lift_mm)} мм`,
    })
  if (spec.reach_mm) rows.push({ key: 'reach_mm', label: 'Вылет', value: `${nf(spec.reach_mm)} мм` })
  if (spec.height_m) rows.push({ key: 'height_m', label: 'Рабочая высота', value: `${nf(spec.height_m, 1)} м` })
  if (spec.runtime_h) rows.push({ key: 'runtime_h', label: 'Автономность', value: `${nf(spec.runtime_h)} ч` })
  return rows
}

function RobotCard({ kind, products }: { kind: Kind; products: Product[] | undefined }) {
  const [vi, setVi] = useState(0)
  const fromCatalog = Boolean(products?.length)
  const product = fromCatalog ? products![Math.min(vi, products!.length - 1)] : undefined
  const detail = useProduct(product?.id)
  const v: Variant = useMemo(
    () => (product ? variantFromProduct(kind, product, detail.data) : kind.variants[vi]),
    [kind, product, detail.data, vi],
  )
  const options = fromCatalog
    ? products!.map((p) => ({ id: p.id, name: cleanName(p.name) }))
    : kind.variants.map((x) => ({ id: x.id, name: x.name }))
  const drag = useRef<DragState>({ yaw: 0 }).current
  const last = useRef<number | null>(null)
  const bounds = useMemo(() => kind.bounds(v), [kind, v])
  const rows = specRows(v.spec)
  const Model = kind.Model

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    last.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (last.current === null) return
    drag.yaw += (e.clientX - last.current) * 0.012
    last.current = e.clientX
  }
  const onUp = () => {
    last.current = null
  }

  return (
    <article className="card flex flex-col overflow-hidden shadow-[var(--shadow-card)]">
      <div
        className="relative h-[300px] cursor-grab touch-pan-y select-none active:cursor-grabbing"
        style={{
          background: `radial-gradient(120% 90% at 50% 30%, #fbfcfd 0%, #eef2f5 55%, ${kind.accent}1f 100%)`,
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <View className="absolute inset-0">
          <Studio bounds={bounds} drag={drag}>
            <Model key={`${v.id}:${detail.data ? 1 : 0}`} v={v} accent={kind.accent} />
          </Studio>
        </View>
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 shadow-sm backdrop-blur">
          <span className="size-2 rounded-full" style={{ background: kind.accent }} />
          {kind.group}
        </div>
        <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1 text-[11px] text-ink-3">
          <RotateCw className="size-3" /> тяните, чтобы повернуть
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h2 className="h3">{kind.title}</h2>
          <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{kind.does}</p>
        </div>
        {options.length > 1 && options.length <= 6 && (
          <div className="flex flex-wrap gap-1.5">
            {options.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setVi(i)}
                className={cn(
                  'h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
                  i === vi
                    ? 'border-ink bg-ink text-white'
                    : 'border-line-2 text-ink-2 hover:border-ink-3 hover:text-ink',
                )}
              >
                {x.name}
              </button>
            ))}
          </div>
        )}
        {options.length > 6 && (
          <Select value={String(vi)} onValueChange={(x) => setVi(Number(x))}>
            <SelectTrigger className="h-8 w-full text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((x, i) => (
                <SelectItem key={x.id} value={String(i)}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {options.length === 1 && <div className="text-[12.5px] font-medium text-ink">{v.name}</div>}
        {product && (
          <div className="-mt-1 flex items-center justify-between gap-3 text-[11.5px] text-ink-3">
            <span className="min-w-0 truncate">
              Класс «{product.solution_type_name ?? v.name}» · {products!.length} в каталоге
              {detail.isLoading && ' · загружаем ТТХ…'}
            </span>
            <Link
              to={`/catalog/${product.id}`}
              className="flex shrink-0 items-center gap-0.5 text-ink-2 hover:text-ink"
            >
              карточка <ArrowUpRight className="size-3" />
            </Link>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          {rows.map((r) => (
            <div key={r.key} className="min-w-0">
              <dt className="text-ink-3">{r.label}</dt>
              <dd className="num flex items-center gap-1.5 font-medium text-ink">
                {r.value}
                {v.assumed?.includes(r.key) && (
                  <span
                    className="rounded bg-warn-soft px-1 text-[10.5px] font-normal text-warn"
                    title="В каталоге нет числа — взято типовое значение класса"
                  >
                    допущение
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto space-y-1.5 border-t border-line pt-3 text-[12px] leading-snug">
          <p>
            <span className="text-ink-3">Форма: </span>
            <span className="text-ink-2">{kind.shape}</span>
          </p>
          <p>
            <span className="text-ink-3">Анимация: </span>
            <span className="text-ink-2">{kind.anim}</span>
          </p>
        </div>
      </div>
    </article>
  )
}

export function RobotsPage() {
  const [group, setGroup] = useState<string>('all')
  const { paused, human, speed, togglePaused, toggleHuman, setSpeed } = useGallery()
  const all = [...KINDS, FALLBACK_KIND]
  const kinds = group === 'all' ? all : all.filter((k) => k.group === group)
  const catalog = useCatalogProducts()
  const { byKind, unmapped, mapped } = useMemo(() => {
    const byKind = new Map<string, Product[]>()
    const unmapped = new Map<string, { name: string; count: number }>()
    let mapped = 0
    for (const p of catalog.data?.items ?? []) {
      const k = kindOf(p)
      if (k) {
        byKind.set(k.id, [...(byKind.get(k.id) ?? []), p])
        mapped += 1
      } else {
        const u = unmapped.get(p.solution_type) ?? { name: p.solution_type_name ?? p.solution_type, count: 0 }
        unmapped.set(p.solution_type, { ...u, count: u.count + 1 })
        byKind.set(FALLBACK_KIND.id, [...(byKind.get(FALLBACK_KIND.id) ?? []), p])
      }
    }
    for (const k of KINDS) if (byKind.has(k.id)) byKind.set(k.id, orderForKind(k, byKind.get(k.id)!))
    return { byKind, unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count), mapped }
  }, [catalog.data])
  const total = catalog.data?.items.length ?? 0
  if (catalog.isPending) return <LoadingBlock label="Загружаем каталог…" />
  if (catalog.isError) return <ErrorBlock error={catalog.error} onRetry={() => catalog.refetch()} />
  return (
    <div className="mx-auto w-full max-w-360 px-6 pt-12 pb-28">
      <div className="mb-2 flex items-baseline gap-3">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Роботы в 3D</h1>
        <span className="display num text-[28px] text-ink-4">{KINDS.length}</span>
      </div>
      <p className="mb-7 max-w-190 text-[15.5px] leading-relaxed text-ink-2">
        Модель привязана к классу решения из каталога, а форму и анимацию задают ТТХ продукта — габариты,
        грузоподъёмность, высота подъёма, вылет и скорость. Новый продукт известного класса сразу получает модель; чего
        нет в ТТХ, берётся по умолчанию класса и помечается.{' '}
        {total > 0 && (
          <span className="num text-ink-3">
            {mapped} из {total} продуктов каталога с моделью
          </span>
        )}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {['all', ...GROUPS].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={cn(
              'h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors',
              g === group ? 'bg-ink text-white' : 'bg-black/[0.05] text-ink-2 hover:bg-black/[0.08] hover:text-ink',
            )}
          >
            {g === 'all' ? 'Все' : g}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHuman}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition-colors',
              human ? 'bg-ink text-white' : 'bg-black/[0.05] text-ink-2 hover:text-ink',
            )}
          >
            <PersonStanding className="size-4" /> Человек 1,75 м
          </button>
          <Segmented
            size="sm"
            layoutId="robots-speed"
            value={speed}
            onChange={setSpeed}
            options={[
              { value: 0.5, label: '×0,5' },
              { value: 1, label: '×1' },
              { value: 2, label: '×2' },
            ]}
          />
          <button
            type="button"
            onClick={togglePaused}
            className="flex h-8 items-center gap-1.5 rounded-[10px] bg-black/[0.05] px-3 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? 'Пуск' : 'Пауза'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {kinds.map((k) => (
          <RobotCard key={k.id} kind={k} products={byKind.get(k.id)} />
        ))}
      </div>

      {unmapped.length > 0 && group === 'all' && (
        <div className="mt-10">
          <h2 className="h3">Классы каталога без своей 3D-модели</h2>
          <p className="mt-1 mb-3 text-[13px] text-ink-3">
            Продукты этих классов рисуются нейтральным роботом; одна модель на класс закроет их все сразу.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map((u) => (
              <span key={u.name} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[12px] text-ink-2">
                {u.name} <span className="num text-ink-3">{u.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* One WebGL context for every card: each card's View is scissored out of this fixed canvas. */}
      <Canvas
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <View.Port />
      </Canvas>
    </div>
  )
}
