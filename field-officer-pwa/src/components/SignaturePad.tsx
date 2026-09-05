import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'

export function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const ink = useRef(Boolean(value))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const initCanvas = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * ratio
        canvas.height = rect.height * ratio
        const context = canvas.getContext('2d')
        context?.scale(ratio, ratio)
        if (context) {
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.lineWidth = 2.4
          context.strokeStyle = '#082f5d'
        }
      }
    }
    initCanvas()
    window.addEventListener('resize', initCanvas)
    return () => window.removeEventListener('resize', initCanvas)
  }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId)
    const context = event.currentTarget.getContext('2d'); const p = point(event)
    context?.beginPath(); context?.moveTo(p.x, p.y)
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = event.currentTarget.getContext('2d'); const p = point(event)
    context?.lineTo(p.x, p.y); context?.stroke(); ink.current = true
  }
  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas && ink.current) onChange(canvas.toDataURL('image/png'))
  }
  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    ink.current = false; onChange('')
  }

  return <div className="signature-field">
    <div className="signature-label"><strong>{label}</strong><button type="button" onClick={clear}><RotateCcw size={15} /> Clear</button></div>
    <div className="signature-canvas-wrap">
      <canvas ref={canvasRef} aria-label={`${label} signature area`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
      <div className="signature-baseline-guide" aria-hidden="true">
        <span className="signature-guide-x">✕</span>
        <span className="signature-guide-line" />
      </div>
    </div>
    <span>{value ? 'Signature captured' : 'Sign inside the box'}</span>
  </div>
}
