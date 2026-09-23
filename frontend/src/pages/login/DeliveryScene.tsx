import { useId } from 'react'
import { motion, useReducedMotion, type Easing } from 'framer-motion'

const W = 640
const FLOOR = 290
const ROBOT_W = 112
const WHEEL_R = 10
const DECK_TOP = FLOOR - 48
const BOX_W = 64
const BOX_H = 48
const BOX_DX = 24
const BOX_REST_Y = DECK_TOP - BOX_H
const CHUTE_Y = 104
const PICK_X = 28
const DROP_X = 404
const CONVEYOR_X = 498
const DURATION = 11

// Phases of one loop as fractions of DURATION: enter, load, accelerate, cruise, brake, unload, leave.
const T = { enter: 0.1, gateOpen: 0.12, land: 0.15, go: 0.22, cruise: 0.27, brake: 0.63, stop: 0.68, unload: 0.71 }

// Accel/brake are half-speed on average, so the cruise speed is chosen to cover the whole route on time.
const SPEED = (DROP_X - PICK_X) / ((T.cruise - T.go) / 2 + (T.brake - T.cruise) + (T.stop - T.brake) / 2)
const ACCEL_DX = (SPEED * (T.cruise - T.go)) / 2
const BRAKE_DX = (SPEED * (T.stop - T.brake)) / 2

const ROBOT_TIMES = [0, T.enter, T.go, T.cruise, T.brake, T.stop, 0.8, 1]
const ROBOT_X = [-150, PICK_X, PICK_X, PICK_X + ACCEL_DX, DROP_X - BRAKE_DX, DROP_X, DROP_X, W + 40]
const ROBOT_EASE: Easing[] = ['easeOut', 'linear', 'easeIn', 'linear', 'easeOut', 'linear', 'easeIn']
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
const BOX_X_EASE: Easing[] = ['linear', 'easeIn', 'linear', 'easeOut', 'linear', 'easeIn', 'linear', 'linear']
const BOX_Y_TIMES = [0, T.gateOpen, T.land, 0.165, 0.18, 0.905, 0.91, 1]
const BOX_Y = [CHUTE_Y, CHUTE_Y, BOX_REST_Y, BOX_REST_Y - 5, BOX_REST_Y, BOX_REST_Y, CHUTE_Y - 50, CHUTE_Y]
const BOX_Y_EASE: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeIn', 'linear', 'linear', 'easeOut']

const STEPS = [
  { x: 150, label: 'Подбор' },
  { x: 230, label: 'Количество' },
  { x: 310, label: 'Экономика' },
  { x: 390, label: 'Имитация' },
]
const REPORT_X = 570
const cruiseStartCenter = PICK_X + ACCEL_DX + ROBOT_W / 2
const passTime = (x: number) => T.cruise + (x - cruiseStartCenter) / SPEED

const CARDBOARD = { face: '#dcb67f', lid: '#e8c995', tape: '#f0dcb8', edge: '#c49a5c' }

const RACKS = [
  {
    x: 160,
    boxes: [
      [34, 22],
      [26, 30],
      [40, 18],
      [30, 26],
      [22, 20],
      [36, 28],
    ],
  },
  {
    x: 318,
    boxes: [
      [28, 26],
      [38, 20],
      [24, 30],
      [32, 22],
      [40, 26],
      [26, 18],
    ],
  },
]

export function DeliveryScene() {
  const reduce = useReducedMotion()
  const gradientId = useId()
  const loop = (times: number[], ease: Easing[] | Easing = 'linear') => ({
    duration: DURATION,
    times,
    ease,
    repeat: Infinity,
  })

  return (
    <svg viewBox="0 20 640 340" preserveAspectRatio="xMidYMax meet" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--info)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--info)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {RACKS.map((rack) => (
        <Rack key={rack.x} x={rack.x} boxes={rack.boxes} />
      ))}

      <line x1="0" x2={W} y1={FLOOR} y2={FLOOR} stroke="var(--input)" strokeWidth="1.5" />
      <line x1="0" x2={W} y1={FLOOR + 14} y2={FLOOR + 14} stroke="var(--input)" strokeDasharray="6 8" />

      {STEPS.map((step) => (
        <Marker key={step.label} x={step.x} label={step.label} lit={passTime(step.x)} animate={!reduce} />
      ))}
      <Marker x={REPORT_X} label="Отчёт" lit={0.84} animate={!reduce} />

      <g>
        <text x={PICK_X + BOX_DX + BOX_W / 2} y="30" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          Ваш объект
        </text>
        <rect x={PICK_X + 12} y="36" width={BOX_W + 24} height="6" rx="3" fill="var(--ink-2)" />
        <rect x={PICK_X + 18} y="42" width="4" height={CHUTE_Y + BOX_H - 42} fill="var(--input)" />
        <rect x={PICK_X + BOX_DX + BOX_W + 2} y="42" width="4" height={CHUTE_Y + BOX_H - 42} fill="var(--input)" />
        <motion.rect
          x={PICK_X + 22}
          y={CHUTE_Y + BOX_H}
          width={BOX_W + 4}
          height="4"
          rx="2"
          fill="var(--ink-2)"
          animate={reduce ? undefined : { scaleX: [1, 1, 0, 0, 1, 1] }}
          transition={loop([0, T.gateOpen - 0.01, T.gateOpen, 0.2, T.go, 1])}
        />
      </g>

      <g>
        <rect x={CONVEYOR_X} y={DECK_TOP + 3} width={W - CONVEYOR_X + 20} height="8" rx="2" fill="var(--ink-2)" />
        {Array.from({ length: 11 }, (_, i) => (
          <circle key={i} cx={CONVEYOR_X + 8 + i * 14} cy={DECK_TOP + 3} r="3" fill="var(--ink-4)" />
        ))}
        <rect x={CONVEYOR_X + 12} y={DECK_TOP + 11} width="4" height={FLOOR - DECK_TOP - 11} fill="var(--input)" />
        <rect x={CONVEYOR_X + 112} y={DECK_TOP + 11} width="4" height={FLOOR - DECK_TOP - 11} fill="var(--input)" />
      </g>

      <motion.g
        initial={false}
        animate={reduce ? undefined : { x: ROBOT_X }}
        transition={loop(ROBOT_TIMES, ROBOT_EASE)}
        style={reduce ? { x: 200 } : undefined}
      >
        <g transform={`translate(0 ${FLOOR})`}>
          <Robot
            gradientId={gradientId}
            reduce={!!reduce}
            wheelTransition={loop(ROBOT_TIMES, ROBOT_EASE)}
            sinkTransition={loop([0, T.land, 0.165, 0.18, 1])}
          />
        </g>
      </motion.g>

      <motion.g
        initial={false}
        animate={reduce ? undefined : { x: BOX_X, y: BOX_Y, opacity: [1, 1, 0, 0, 1, 1] }}
        transition={{
          x: loop(BOX_X_TIMES, BOX_X_EASE),
          y: loop(BOX_Y_TIMES, BOX_Y_EASE),
          opacity: loop([0, 0.895, 0.9, 0.91, 0.93, 1]),
        }}
        style={reduce ? { x: 200 + BOX_DX, y: BOX_REST_Y } : undefined}
      >
        <Parcel />
      </motion.g>
    </svg>
  )
}

function Robot({
  gradientId,
  reduce,
  wheelTransition,
  sinkTransition,
}: {
  gradientId: string
  reduce: boolean
  wheelTransition: object
  sinkTransition: object
}) {
  return (
    <>
      <ellipse cx={ROBOT_W / 2} cy="2" rx="52" ry="4" fill="#000" opacity="0.1" />
      {[26, 86].map((cx) => (
        <motion.g key={cx} animate={reduce ? undefined : { rotate: WHEEL_ROTATE }} transition={wheelTransition}>
          <circle cx={cx} cy={-WHEEL_R} r={WHEEL_R} fill="#2b2b31" stroke="var(--foreground)" strokeWidth="2" />
          <line x1={cx - 6} x2={cx + 6} y1={-WHEEL_R} y2={-WHEEL_R} stroke="var(--ink-4)" strokeWidth="1.5" />
          <line x1={cx} x2={cx} y1={-WHEEL_R - 6} y2={-WHEEL_R + 6} stroke="var(--ink-4)" strokeWidth="1.5" />
          <circle cx={cx} cy={-WHEEL_R} r="2.5" fill="var(--ink-4)" />
        </motion.g>
      ))}
      <motion.g animate={reduce ? undefined : { y: [0, 0, 2, 0, 0] }} transition={sinkTransition}>
        <motion.path
          d="M106 -32 L196 -60 L196 -4 Z"
          fill={`url(#${gradientId})`}
          animate={reduce ? { opacity: 0.6 } : { opacity: [0.15, 0.8, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <rect x="2" y="-42" width={ROBOT_W - 4} height="28" rx="9" fill="var(--foreground)" />
        <rect x="2" y="-21" width={ROBOT_W - 4} height="2" fill="#fff" opacity="0.08" />
        <rect x="12" y="-48" width="88" height="7" rx="3.5" fill="var(--ink-2)" />
        <rect x="20" y="-34" width="30" height="3" rx="1.5" fill="var(--info)" />
        <rect x="101" y="-37" width="6" height="10" rx="2" fill="var(--info)" />
        <motion.circle
          cx="62"
          cy="-32.5"
          r="2.2"
          fill="var(--ok)"
          animate={reduce ? undefined : { opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
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

function Marker({ x, label, lit, animate }: { x: number; label: string; lit: number; animate: boolean }) {
  const transition = { duration: DURATION, times: [0, lit, lit + 0.01, 0.95, 1], repeat: Infinity }
  const keys = [0, 0, 1, 1, 0]
  const y = FLOOR + 14
  return (
    <g>
      <circle cx={x} cy={y} r="4" fill="var(--ink-4)" />
      <text x={x} y={y + 20} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
        {label}
      </text>
      <motion.g initial={{ opacity: 0 }} animate={animate ? { opacity: keys } : { opacity: 1 }} transition={transition}>
        <circle cx={x} cy={y} r="9" fill="var(--info)" opacity="0.15" />
        <circle cx={x} cy={y} r="4.5" fill="var(--info)" />
        <text x={x} y={y + 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
          {label}
        </text>
      </motion.g>
    </g>
  )
}

function Rack({ x, boxes }: { x: number; boxes: number[][] }) {
  const width = 132
  const shelves = [150, 200, 250]
  return (
    <g opacity="0.9">
      {shelves.map((sy, row) => {
        let bx = x + 8
        return (
          <g key={sy}>
            {boxes.slice(row * 2, row * 2 + 2).map(([bw, bh], i) => {
              const rect = (
                <rect
                  key={i}
                  x={bx}
                  y={sy - bh}
                  width={bw}
                  height={bh}
                  rx="2"
                  fill="var(--secondary)"
                  stroke="var(--border)"
                />
              )
              bx += bw + 14 + row * 6
              return rect
            })}
            <rect x={x} y={sy} width={width} height="4" rx="1" fill="var(--input)" />
          </g>
        )
      })}
      <rect x={x} y="104" width="4" height={FLOOR - 104} fill="var(--input)" />
      <rect x={x + width - 4} y="104" width="4" height={FLOOR - 104} fill="var(--input)" />
    </g>
  )
}
