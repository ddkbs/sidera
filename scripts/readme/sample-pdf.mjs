// Builds a tiny, valid, single-page PDF (Helvetica text only) entirely in memory so the README
// screenshot script can seed a realistic "research paper" without shipping a binary fixture.
// Byte offsets are computed as we go, so the xref table is exact.

const LINES = [
  { text: 'Local-first knowledge tools', size: 20, gap: 34 },
  { text: 'A. Morgan, M. Chen  --  Atlas Research Group', size: 11, gap: 30 },
  { text: 'Abstract', size: 13, gap: 22 },
  { text: 'Teams lose context when notes live across five different tools.', size: 11, gap: 18 },
  { text: 'Whiteboards let people think before they commit to a structure,', size: 11, gap: 18 },
  { text: 'and a local-first store means the notes stay on the device that', size: 11, gap: 18 },
  { text: 'made them.', size: 11, gap: 30 },
  { text: '1. Introduction', size: 13, gap: 22 },
  { text: 'Existing tools force an early choice between a document and a', size: 11, gap: 18 },
  { text: 'canvas. We argue the two are the same artifact viewed at', size: 11, gap: 18 },
  { text: 'different zoom levels, and that an open agent interface should', size: 11, gap: 18 },
  { text: 'be able to act on either view, not just answer questions about it.', size: 11, gap: 30 },
  { text: '2. Findings', size: 13, gap: 22 },
  { text: 'Across 12 interviews, willingness to pay peaked at $8-12/month', size: 11, gap: 18 },
  { text: 'for a tool that kept full data ownership and worked offline.', size: 11, gap: 18 }
]

function buildContentStream() {
  let y = 740
  const parts = ['BT', '/F1 11 Tf']
  for (const line of LINES) {
    parts.push(`/F1 ${line.size} Tf`, `1 0 0 1 72 ${y} Tm`, `(${escapePdfText(line.text)}) Tj`)
    y -= line.gap
  }
  parts.push('ET')
  return parts.join('\n')
}

function escapePdfText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function buildSamplePdf() {
  const content = buildContentStream()
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}

/** Fraction-of-page-box rects ({x,y,w,h} in 0..1) approximating two lines above, for a highlight demo. */
export const SAMPLE_HIGHLIGHTS = [
  { text: 'Across 12 interviews, willingness to pay peaked at $8-12/month', rect: { x: 0.115, y: 0.418, w: 0.58, h: 0.023 }, color: 'yellow' }
]
