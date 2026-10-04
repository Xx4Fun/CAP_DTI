import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'

export function SignaturePad({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const ink = useRef(Boolean(value))
  const lastRenderedValue = useRef<string>(value || '')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false

    const restoreImage = (context: CanvasRenderingContext2D, width: number, height: number, dataUrl: string) => {
      if (!dataUrl) return
      const img = new Image()
      img.onload = () => {
        if (disposed || lastRenderedValue.current !== dataUrl) return
        context.drawImage(img, 0, 0, width, height)
      }
      img.src = dataUrl
    }

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
          if (lastRenderedValue.current) {
            restoreImage(context, rect.width, rect.height, lastRenderedValue.current)
          }
        }
      }
    }
    initCanvas()
    window.addEventListener('resize', initCanvas)
    return () => { disposed = true; window.removeEventListener('resize', initCanvas) }
  }, [])

  // Restore image when value changes externally (e.g. initial prop load or reset)
  useEffect(() => {
    let disposed = false
    if (!value) {
      if (lastRenderedValue.current) {
        const canvas = canvasRef.current
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        lastRenderedValue.current = ''
        ink.current = false
      }
      return
    }
    if (value === lastRenderedValue.current) return
    lastRenderedValue.current = value
    ink.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (context && rect.width > 0 && rect.height > 0) {
      const img = new Image()
      img.onload = () => {
        if (disposed || lastRenderedValue.current !== value) return
        context.drawImage(img, 0, 0, rect.width, rect.height)
      }
      img.src = value
    }
    return () => { disposed = true }
  }, [value])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId)
    const context = event.currentTarget.getContext('2d'); const p = point(event)
    context?.beginPath(); context?.moveTo(p.x, p.y)
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawing.current) return
    const context = event.currentTarget.getContext('2d'); const p = point(event)
    context?.lineTo(p.x, p.y); context?.stroke(); ink.current = true
  }
  const finish = () => {
    if (disabled) { drawing.current = false; return }
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas && ink.current) {
      const dataUrl = canvas.toDataURL('image/png')
      lastRenderedValue.current = dataUrl
      onChange(dataUrl)
    }
  }
  const clear = () => {
    if (disabled) return
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    ink.current = false
    lastRenderedValue.current = ''
    onChange('')
  }

  return <div className="signature-field">
    <div className="signature-label"><strong>{label}</strong><button type="button" disabled={disabled} onClick={clear}><RotateCcw size={15} /> Clear</button></div>
    <div className="signature-canvas-wrap">
      <canvas ref={canvasRef} aria-disabled={disabled} aria-label={`${label} signature area`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
      <div className="signature-baseline-guide" aria-hidden="true">
        <span className="signature-guide-x">✕</span>
        <span className="signature-guide-line" />
      </div>
    </div>
    <span>{value ? 'Signature captured' : 'Sign inside the box'}</span>
  </div>
}
