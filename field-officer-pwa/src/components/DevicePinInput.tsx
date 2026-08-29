import { useEffect, useRef } from 'react'

interface DevicePinInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
  autoFocus?: boolean
  length?: number
}

export function DevicePinInput({ value, onChange, label = '4-digit device PIN', disabled = false, autoFocus = false, length = 4 }: DevicePinInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])
  const normalized = value.replace(/\D/g, '').slice(0, length)
  return <label className="device-pin-field">
    <span className="sr-only">{label}</span>
    <span className="pin-slots" aria-hidden="true" onClick={() => inputRef.current?.focus()}>
      {Array.from({ length }, (_, index) => <span key={index} className={index === normalized.length ? 'active' : ''}>{index < normalized.length ? '•' : ''}</span>)}
    </span>
    <input
      ref={inputRef}
      className="device-pin-native"
      aria-label={label}
      autoComplete="off"
      disabled={disabled}
      inputMode="numeric"
      pattern="[0-9]*"
      type="text"
      value={normalized}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, length))}
    />
  </label>
}
