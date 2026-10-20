export type ImmersiveSignal = { progress: number; compact: boolean }

export const blend = (value: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

export const DEMO = 'https://prooood.ru/demo'
export const WAREHOUSE = `${DEMO}/warehouse_demo_01`
