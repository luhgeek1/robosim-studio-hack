import type { Layout } from '@/shared/api/types'
import { formatDateTime, formatNumber, formatValue, isNum } from '@/shared/lib/format'
import { DERIVATION_INPUT_KIND_LABEL, TEMPLATE_LABEL } from './labels'

const MONO = 'Consolas'
const MUTED = '6B6B72'
// A4 text width at the default 1" margins, in twentieths of a point: Word and LibreOffice both honour fixed widths.
const PAGE_DXA = 9026
const dxa = (share: number) => Math.round((PAGE_DXA * share) / 100)

/* «Как получена геометрия» as a Word document for the survey file: the figures and routes the plan gives,
   then every derivation step with its formula, substitution and inputs. Built in the browser from the same
   layout the page shows; `docx` is loaded only when someone asks for the file. */
export async function derivationDocument(layout: Layout, projectName: string): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')

  const text = (value: string, opts: { bold?: boolean; mono?: boolean; muted?: boolean; size?: number } = {}) =>
    new TextRun({
      text: value,
      bold: opts.bold,
      font: opts.mono ? MONO : undefined,
      color: opts.muted ? MUTED : undefined,
      size: opts.size,
    })
  const para = (runs: InstanceType<typeof TextRun>[], spacingAfter = 120) =>
    new Paragraph({ children: runs, spacing: { after: spacingAfter } })

  const line = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D4' }
  const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line }
  // A cell is one line of text or several (name with its key under it); `width` is a share of the page.
  const cell = (value: string | string[], opts: { right?: boolean; head?: boolean; width?: number } = {}) =>
    new TableCell({
      children: (Array.isArray(value) ? value : [value]).map(
        (line, i) =>
          new Paragraph({
            alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              i ? text(line, { mono: true, muted: true, size: 16 }) : text(line, { bold: opts.head, size: 20 }),
            ],
          }),
      ),
      width: opts.width ? { size: dxa(opts.width), type: WidthType.DXA } : undefined,
      shading: opts.head ? { type: ShadingType.CLEAR, fill: 'F4F4F2', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    })
  const table = (head: string[], rows: (string | string[])[][], widths: number[], numeric: number[] = []) =>
    new Table({
      width: { size: PAGE_DXA, type: WidthType.DXA },
      columnWidths: widths.map(dxa),
      layout: TableLayoutType.FIXED,
      borders,
      rows: [
        new TableRow({
          tableHeader: true,
          children: head.map((h, i) => cell(h, { head: true, right: numeric.includes(i), width: widths[i] })),
        }),
        ...rows.map(
          (row) =>
            new TableRow({ children: row.map((v, i) => cell(v, { right: numeric.includes(i), width: widths[i] })) }),
        ),
      ],
    })

  const { stats } = layout
  const figures: string[][] = [
    ['Размер здания', `${formatNumber(layout.width_m)} × ${formatNumber(layout.height_m)} м`],
    ...(isNum(stats.rack_slots_total) ? [['Паллетомест в стеллажах', formatNumber(stats.rack_slots_total)]] : []),
    ...(isNum(stats.docks_in) || isNum(stats.docks_out)
      ? [['Ворота приёмки / отгрузки', `${formatNumber(stats.docks_in ?? 0)} / ${formatNumber(stats.docks_out ?? 0)}`]]
      : []),
    ...(isNum(stats.pick_stations) ? [['Станций отбора', formatNumber(stats.pick_stations)]] : []),
    ...(isNum(stats.pods) ? [['Мобильных стеллажей G2P', formatNumber(stats.pods)]] : []),
    ...(isNum(stats.chargers) ? [['Зарядных мест', formatNumber(stats.chargers)]] : []),
    ...(isNum(stats.min_aisle_width_m) ? [['Самый узкий проезд', formatValue(stats.min_aisle_width_m, 'м')]] : []),
  ]
  const routes = (stats.routes ?? []).map((r) => [r.name, formatNumber(r.value_m), formatNumber(r.pairs)])

  const steps = layout.derivation.flatMap((step, index) => [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 80 },
      children: [text(`${index + 1}. ${step.name} — ${formatValue(step.value, step.unit)}`)],
    }),
    para([text('Формула: ', { muted: true, size: 20 }), text(step.formula, { mono: true, size: 20 })], 40),
    para([text('Подстановка: ', { muted: true, size: 20 }), text(step.formula_rendered, { mono: true, size: 20 })]),
    ...(step.inputs.length
      ? [
          table(
            ['Вход', 'Откуда', 'Значение'],
            step.inputs.map((input) => [
              [input.name, input.key],
              DERIVATION_INPUT_KIND_LABEL[input.kind] ?? input.kind,
              formatValue(input.value, input.unit),
            ]),
            [58, 22, 20],
            [2],
          ),
        ]
      : []),
  ])

  const meta = [
    layout.template ? (TEMPLATE_LABEL[layout.template] ?? layout.template) : null,
    layout.generated ? 'построена генератором' : 'изменена вручную',
    `версия ${layout.version}`,
    layout.updated_at ? `обновлена ${formatDateTime(layout.updated_at)}` : null,
  ].filter(Boolean)

  const doc = new Document({
    creator: 'РобоМера',
    title: `Как получена геометрия — ${projectName}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [text('Как получена геометрия планировки')] }),
          para([text(projectName, { bold: true })], 40),
          para([text(meta.join(' · '), { muted: true, size: 20 })], 240),
          para([
            text(
              'Схема построена из параметров объекта и нормативов, это не CAD. Каждый размер ниже — формула с подставленными ' +
                'значениями; средние маршруты по графу проездов идут в цикл робота и в имитацию.',
              { size: 20 },
            ),
          ]),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text('Что вытекает из геометрии')] }),
          table(['Показатель', 'Значение'], figures, [70, 30], [1]),
          ...(routes.length
            ? [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 240 },
                  children: [text('Средние маршруты')],
                }),
                para(
                  [text('Кратчайшие пути по графу проездов, усреднённые по парам точек.', { muted: true, size: 20 })],
                  80,
                ),
                table(['Маршрут', 'Длина, м', 'Пар усреднено'], routes, [60, 20, 20], [1, 2]),
              ]
            : []),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240 },
            children: [text(`Шаги вывода (${layout.derivation.length})`)],
          }),
          ...steps,
        ],
      },
    ],
  })
  return Packer.toBlob(doc)
}
