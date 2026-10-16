import { useId } from 'react'
import {
  easeIn,
  easeOut,
  motion,
  useReducedMotion,
  useTime,
  useTransform,
  type EasingFunction,
  type MotionValue,
} from 'framer-motion'
import { PROJECT_STEPS } from '@/entities/project'

const W = 760
const FLOOR = 290
const LANE = FLOOR + 16
const ROBOT_W = 112
const WHEEL_R = 7
const DECK_TOP = FLOOR - 48
const BOX_W = 64
const BOX_H = 48
const BOX_DX = 24
const BOX_REST_Y = DECK_TOP - BOX_H
const CHUTE_Y = 104
const PICK_X = 28
const DROP_X = 560
const CONVEYOR_X = DROP_X + 94
const DURATION = 12
// With reduced motion the scene freezes on this moment of the loop: the robot mid-route with the parcel.
const STILL = 0.45
const linear: EasingFunction = (t) => t

// Phases of one loop as fractions of DURATION: enter, load, accelerate, cruise, brake, unload, leave.
const T = { enter: 0.1, gateOpen: 0.12, land: 0.15, go: 0.22, cruise: 0.27, brake: 0.63, stop: 0.68, unload: 0.71 }
const REPORT_AT = 0.84

// Accel/brake are half-speed on average, so the cruise speed is chosen to cover the whole route on time.
const SPEED = (DROP_X - PICK_X) / ((T.cruise - T.go) / 2 + (T.brake - T.cruise) + (T.stop - T.brake) / 2)
const ACCEL_DX = (SPEED * (T.cruise - T.go)) / 2
const BRAKE_DX = (SPEED * (T.stop - T.brake)) / 2

const ROBOT_TIMES = [0, T.enter, T.go, T.cruise, T.brake, T.stop, 0.8, 1]
const ROBOT_X = [-150, PICK_X, PICK_X, PICK_X + ACCEL_DX, DROP_X - BRAKE_DX, DROP_X, DROP_X, W + 40]
const ROBOT_EASE: EasingFunction[] = [easeOut, linear, easeIn, linear, easeOut, linear, easeIn]
// Wheels turn by the distance travelled, with the same keyframes, so they never slip.
const WHEEL_ROTATE = ROBOT_X.map((x) => (((x - ROBOT_X[0]) / WHEEL_R) * 180) / Math.PI)

const BOX_X_TIMES = [0, T.go, T.cruise, T.brake, T.stop, T.unload, 0.9, 0.905, 1]
const BOX_X = [
  PICK_X + BOX_DX,
  PICK_X + BOX_DX,
  PICK_X + ACCEL_DX + BOX_DX,
  DROP_X - BRAKE_DX + BOX_DX,
  DROP_X + BOX_DX,
  DROP_X + BOX_DX,
  W + 20,
  PICK_X + BOX_DX,
  PICK_X + BOX_DX,
]
const BOX_X_EASE = [linear, easeIn, linear, easeOut, linear, easeIn, linear, linear]
const BOX_Y_TIMES = [0, T.gateOpen, T.land, 0.165, 0.18, 0.905, 0.91, 1]
const BOX_Y = [CHUTE_Y, CHUTE_Y, BOX_REST_Y, BOX_REST_Y - 5, BOX_REST_Y, BOX_REST_Y, CHUTE_Y - 50, CHUTE_Y]
const BOX_Y_EASE = [linear, easeIn, easeOut, easeIn, linear, linear, easeOut]

// The lane is a short version of the project path: the object is loaded at the chute, the report leaves
// on the conveyor, and the key steps in between light up as the robot drives past them.
const LANE_STEPS = PROJECT_STEPS.filter((step) =>
  ['object', 'matching', 'scenarios', 'simulation', 'report'].includes(step.id),
)
const OBJECT_X = PICK_X + ROBOT_W / 2
const REPORT_X = CONVEYOR_X + 50
const cruiseStartCenter = PICK_X + ACCEL_DX + ROBOT_W / 2
const passTime = (x: number) => T.cruise + (x - cruiseStartCenter) / SPEED
const MARKERS = LANE_STEPS.map((step, i) => {
  if (i === 0) return { label: step.label, x: OBJECT_X, lit: T.land }
  if (i === LANE_STEPS.length - 1) return { label: step.label, x: REPORT_X, lit: REPORT_AT }
  const x = OBJECT_X + ((REPORT_X - OBJECT_X) * i) / (LANE_STEPS.length - 1)
  return { label: step.label, x, lit: passTime(x) }
})

// The progress bar follows the robot with the same keyframes, then runs on to the report with the parcel.
const PATH_LEN = REPORT_X - OBJECT_X
const pathScale = (x: number) => Math.min(1, Math.max(0, (x + ROBOT_W / 2 - OBJECT_X) / PATH_LEN))
const PATH_TIMES = [0, T.go, T.cruise, T.brake, T.stop, REPORT_AT, 0.99, 1]
const PATH_SCALE = [0, 0, ...ROBOT_X.slice(3, 6).map(pathScale), 1, 1, 0]
const PATH_EASE = [linear, easeIn, linear, easeOut, easeIn, linear, linear]

// The same loader AMR as in the 3D twin (widgets/twin/RobotMesh): teal hull, light deck, dark front sensor, green light.
const AMR = {
  hullTop: '#3592b4',
  hullBottom: '#1f6883',
  deck: '#e9edf9',
  deckEdge: '#cbd3e6',
  sensor: '#111318',
  light: '#35c27a',
  wheel: '#1c2227',
}
const CARDBOARD = { face: '#dcb67f', lid: '#e8c995', tape: '#f0dcb8', edge: '#c49a5c' }
const STOCK = {
  box: '#ecdcc0',
  boxEdge: '#d9c29b',
  boxTape: '#f5ead6',
  tote: '#e1e7f7',
  toteEdge: '#bccaee',
  beam: '#c7ccd8',
  upright: '#d6d6d1',
  hole: '#b9b9b4',
  pallet: '#d2b48a',
}

type Stock = ['box' | 'tote', number, number]
// Rack contents as "kind width×height" per bay: b — carton, t — plastic tote; bays are split by "|".
const parseBay = (bay: string): Stock[] =>
  bay
    .trim()
    .split(/\s+/)
    .map((item) => {
      const [w, h] = item.slice(1).split('x').map(Number)
      return [item[0] === 't' ? 'tote' : 'box', w, h]
    })
const rack = (x: number, code: string, levels: string[], pallet: string) => ({
  x,
  code,
  levels: levels.map((level) => level.split('|').map(parseBay)),
  pallet: parseBay(pallet),
})
const RACKS = [
  rack(
    172,
    'A-01',
    ['t24x20 t24x20 | b40x30', 'b22x34 b28x24 | t26x18 t22x18', 't26x20 | b20x18 b28x36'],
    'b46x22 b46x22',
  ),
  rack(
    330,
    'A-02',
    ['b30x34 t22x20 | b24x24 b20x16', 't24x20 t24x20 | t24x20 t24x20', 'b44x28 | b20x38 b24x22'],
    'b30x24 b30x24 b30x24',
  ),
  rack(488, 'A-03', ['b18x22 b30x34 | t40x22', 'b40x26 | t22x20 b22x32', 't24x20 t24x20 | b44x30'], 'b94x26'),
]
const RACK_W = 140
const RACK_TOP = 96
const BEAMS = [148, 200, 252]

export function DeliveryScene() {
  const reduce = useReducedMotion()
  const gradientId = useId()
  // Every moving part reads one shared clock, so the lit steps can never drift away from the robot.
  const time = useTime()
  const progress = useTransform(time, (ms) => (reduce ? STILL : (ms / 1000 / DURATION) % 1))
  const robotX = useTransform(progress, ROBOT_TIMES, ROBOT_X, { ease: ROBOT_EASE })
  const wheelRotate = useTransform(progress, ROBOT_TIMES, WHEEL_ROTATE, { ease: ROBOT_EASE })
  const sink = useTransform(progress, [0, T.land, 0.165, 0.18, 1], [0, 0, 2, 0, 0])
  const boxX = useTransform(progress, BOX_X_TIMES, BOX_X, { ease: BOX_X_EASE })
  const boxY = useTransform(progress, BOX_Y_TIMES, BOX_Y, { ease: BOX_Y_EASE })
  const boxOpacity = useTransform(progress, [0, 0.895, 0.9, 0.91, 0.93, 1], [1, 1, 0, 0, 1, 1])
  const pathScaleX = useTransform(progress, PATH_TIMES, PATH_SCALE, { ease: PATH_EASE })
  const pathOpacity = useTransform(progress, [0, 0.95, 0.99, 1], [1, 1, 0, 0])
  const gate = useTransform(progress, [0, T.gateOpen - 0.01, T.gateOpen, 0.2, T.go, 1], [1, 1, 0, 0, 1, 1])

  return (
    <svg viewBox={`0 34 ${W} 312`} className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--info)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--info)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {RACKS.map((rack) => (
        <Rack key={rack.code} {...rack} />
      ))}

      <line x1="0" x2={W} y1={FLOOR} y2={FLOOR} stroke="var(--input)" strokeWidth="1.5" />
      <line x1="0" x2={W} y1={LANE} y2={LANE} stroke="var(--input)" strokeDasharray="6 8" />
      <motion.rect
        x={OBJECT_X}
        y={LANE - 1.5}
        width={PATH_LEN}
        height="3"
        rx="1.5"
        fill="var(--info)"
        style={{ originX: 0, scaleX: pathScaleX, opacity: pathOpacity }}
      />

      {MARKERS.map((marker, i) => (
        <Marker key={marker.label} index={i} {...marker} progress={progress} />
      ))}

      <g>
        <rect x={PICK_X + 12} y="40" width={BOX_W + 24} height="6" rx="3" fill="var(--ink-2)" />
        <rect x={PICK_X + 18} y="46" width="4" height={CHUTE_Y + BOX_H - 46} fill="var(--input)" />
        <rect x={PICK_X + BOX_DX + BOX_W + 2} y="46" width="4" height={CHUTE_Y + BOX_H - 46} fill="var(--input)" />
        <motion.rect
          x={PICK_X + 22}
          y={CHUTE_Y + BOX_H}
          width={BOX_W + 4}
          height="4"
          rx="2"
          fill="var(--ink-2)"
          style={{ scaleX: gate }}
        />
      </g>

      <g>
        <rect x={CONVEYOR_X} y={DECK_TOP + 3} width={W - CONVEYOR_X + 20} height="8" rx="2" fill="var(--ink-2)" />
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={CONVEYOR_X + 8 + i * 14} cy={DECK_TOP + 3} r="3" fill="var(--ink-4)" />
        ))}
        <rect x={CONVEYOR_X + 12} y={DECK_TOP + 11} width="4" height={FLOOR - DECK_TOP - 11} fill="var(--input)" />
        <rect x={CONVEYOR_X + 84} y={DECK_TOP + 11} width="4" height={FLOOR - DECK_TOP - 11} fill="var(--input)" />
      </g>

      <motion.g style={{ x: robotX }}>
        <g transform={`translate(0 ${FLOOR})`}>
          <Robot gradientId={gradientId} still={!!reduce} wheelRotate={wheelRotate} sink={sink} />
        </g>
      </motion.g>

      <motion.g style={{ x: boxX, y: boxY, opacity: boxOpacity }}>
        <Parcel />
      </motion.g>
    </svg>
  )
}

function Robot({
  gradientId,
  still,
  wheelRotate,
  sink,
}: {
  gradientId: string
  still: boolean
  wheelRotate: MotionValue<number>
  sink: MotionValue<number>
}) {
  const hullId = `${gradientId}-hull`
  return (
    <>
      <defs>
        <linearGradient id={hullId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={AMR.hullTop} />
          <stop offset="1" stopColor={AMR.hullBottom} />
        </linearGradient>
      </defs>
      <ellipse cx={ROBOT_W / 2} cy="2" rx="52" ry="4" fill="#000" opacity="0.12" />
      {/* Drive wheels sit under the hull skirt, as on a real AMR; only their lower half shows. */}
      {[24, 88].map((cx) => (
        <motion.g key={cx} style={{ rotate: wheelRotate }}>
          <circle cx={cx} cy={-WHEEL_R} r={WHEEL_R} fill={AMR.wheel} />
          <line x1={cx - 4.5} x2={cx + 4.5} y1={-WHEEL_R} y2={-WHEEL_R} stroke="#5b6670" strokeWidth="1.5" />
          <line x1={cx} x2={cx} y1={-WHEEL_R - 4.5} y2={-WHEEL_R + 4.5} stroke="#5b6670" strokeWidth="1.5" />
        </motion.g>
      ))}
      <motion.g style={{ y: sink }}>
        <motion.path
          d="M110 -27 L196 -55 L196 1 Z"
          fill={`url(#${gradientId})`}
          animate={still ? { opacity: 0.6 } : { opacity: [0.15, 0.8, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <rect x="2" y="-42" width={ROBOT_W - 4} height="34" rx="10" fill={`url(#${hullId})`} />
        <rect x="12" y="-40" width={ROBOT_W - 24} height="1.5" rx="0.75" fill="#fff" opacity="0.3" />
        <rect x="16" y="-27" width="34" height="3" rx="1.5" fill="#fff" opacity="0.35" />
        {[64, 69, 74].map((vx) => (
          <rect key={vx} x={vx} y="-30" width="2" height="9" rx="1" fill={AMR.hullBottom} />
        ))}
        <rect x="106" y="-33" width="5" height="13" rx="1.5" fill={AMR.sensor} />
        <rect x="107.5" y="-30" width="2" height="4" rx="1" fill="#6ea8ff" opacity="0.8" />
        <rect x="7" y="-48" width="98" height="7" rx="2" fill={AMR.deck} stroke={AMR.deckEdge} />
        <motion.circle
          cx="13"
          cy="-51"
          r="6"
          fill={AMR.light}
          opacity="0.25"
          animate={still ? undefined : { opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <circle cx="13" cy="-51" r="3" fill={AMR.light} />
      </motion.g>
    </>
  )
}

function Parcel() {
  return (
    <>
      <rect width={BOX_W} height={BOX_H} rx="4" fill={CARDBOARD.face} stroke={CARDBOARD.edge} />
      <rect x="0.5" y="0.5" width={BOX_W - 1} height="9" rx="3.5" fill={CARDBOARD.lid} />
      <rect x={BOX_W / 2 - 4} y="0.5" width="8" height={BOX_H - 1} fill={CARDBOARD.tape} />
      <rect x="8" y="22" width="18" height="15" rx="2" fill="#fff" />
      <rect x="11" y="26" width="12" height="2" rx="1" fill="var(--ink-4)" />
      <rect x="11" y="31" width="8" height="2" rx="1" fill="var(--ink-4)" />
    </>
  )
}

function Marker({
  x,
  label,
  lit,
  index,
  progress,
}: {
  x: number
  label: string
  lit: number
  index: number
  progress: MotionValue<number>
}) {
  const opacity = useTransform(progress, [0, lit, lit + 0.01, 0.95, 1], [0, 0, 1, 1, 0])
  const labelY = LANE + 30
  const number = String(index + 1)
  return (
    <g>
      <circle cx={x} cy={LANE} r="8" fill="var(--card)" stroke="var(--input)" />
      <text x={x} y={LANE + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--muted-foreground)">
        {number}
      </text>
      <text x={x} y={labelY} textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">
        {label}
      </text>
      <motion.g style={{ opacity }}>
        <circle cx={x} cy={LANE} r="13" fill="var(--info)" opacity="0.15" />
        <circle cx={x} cy={LANE} r="8" fill="var(--info)" />
        <text x={x} y={LANE + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff">
          {number}
        </text>
        <text x={x} y={labelY} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--foreground)">
          {label}
        </text>
      </motion.g>
    </g>
  )
}

function Rack({ x, code, levels, pallet }: { x: number; code: string; levels: Stock[][][]; pallet: Stock[] }) {
  const inner = x + 6
  const uprights = [x, x + RACK_W / 2 - 2.5, x + RACK_W - 5]
  const holes = Array.from({ length: Math.floor((FLOOR - RACK_TOP - 8) / 8) }, (_, i) => RACK_TOP + 6 + i * 8)
  return (
    <g>
      <rect x={x + RACK_W / 2 - 17} y={RACK_TOP - 18} width="34" height="13" rx="2.5" fill="var(--ink-2)" />
      <text x={x + RACK_W / 2} y={RACK_TOP - 8.5} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#fff">
        {code}
      </text>
      <line x1={x + RACK_W / 2} x2={x + RACK_W / 2} y1={RACK_TOP - 5} y2={RACK_TOP} stroke="var(--ink-4)" />

      {levels.map(([left, right], level) => (
        <g key={level}>
          <StockRow items={left} left={inner} right={x + RACK_W / 2 - 3} floor={BEAMS[level]} />
          <StockRow items={right} left={x + RACK_W / 2 + 3} right={x + RACK_W - 6} floor={BEAMS[level]} />
        </g>
      ))}
      <rect x={inner + 4} y={FLOOR - 7} width={RACK_W - 20} height="3" fill={STOCK.pallet} />
      {[0, 0.5, 1].map((f) => (
        <rect key={f} x={inner + 4 + f * (RACK_W - 30)} y={FLOOR - 4} width="10" height="4" fill={STOCK.pallet} />
      ))}
      <StockRow items={pallet} left={inner + 6} right={x + RACK_W - 12} floor={FLOOR - 7} />

      {uprights.map((ux) => (
        <g key={ux}>
          <rect x={ux} y={RACK_TOP} width="5" height={FLOOR - RACK_TOP} fill={STOCK.upright} />
          {holes.map((hy) => (
            <rect key={hy} x={ux + 1.75} y={hy} width="1.5" height="3" rx="0.75" fill={STOCK.hole} />
          ))}
          <rect x={ux - 2} y={FLOOR - 3} width="9" height="3" rx="1" fill="var(--ink-4)" />
        </g>
      ))}
      {BEAMS.map((by) => (
        <g key={by}>
          <rect x={x} y={by} width={RACK_W} height="6" rx="1" fill={STOCK.beam} />
          <rect x={x} y={by} width={RACK_W} height="1.5" fill="#fff" opacity="0.5" />
          {[0.2, 0.7].map((f) => (
            <g key={f}>
              <rect x={x + f * RACK_W} y={by + 1.5} width="14" height="3.5" rx="0.5" fill="#fff" />
              <rect x={x + f * RACK_W + 2} y={by + 2.5} width="10" height="1.5" fill="var(--ink-4)" />
            </g>
          ))}
        </g>
      ))}
    </g>
  )
}

function StockRow({ items, left, right, floor }: { items: Stock[]; left: number; right: number; floor: number }) {
  const used = items.reduce((sum, [, w]) => sum + w, 0)
  const spacing = (right - left - used) / (items.length + 1)
  return (
    <>
      {items.map(([kind, w, h], i) => {
        const sx = left + spacing * (i + 1) + items.slice(0, i).reduce((sum, [, iw]) => sum + iw, 0)
        const y = floor - h
        if (kind === 'tote')
          return (
            <g key={i}>
              <rect x={sx} y={y} width={w} height={h} rx="2" fill={STOCK.tote} stroke={STOCK.toteEdge} />
              <rect x={sx + w * 0.3} y={y + 3} width={w * 0.4} height="3" rx="1.5" fill={STOCK.toteEdge} />
              <line x1={sx + 2} x2={sx + w - 2} y1={y + h * 0.6} y2={y + h * 0.6} stroke={STOCK.toteEdge} />
            </g>
          )
        return (
          <g key={i}>
            <rect x={sx} y={y} width={w} height={h} rx="1.5" fill={STOCK.box} stroke={STOCK.boxEdge} />
            <rect x={sx + w / 2 - 2} y={y + 0.5} width="4" height={h - 1} fill={STOCK.boxTape} />
            {h > 24 && <rect x={sx + 4} y={y + h - 11} width="9" height="6" rx="1" fill="#fff" opacity="0.9" />}
          </g>
        )
      })}
    </>
  )
}
