import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from './IconButton';

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  revealLabel?: string;
};

export function Field({ label, hint, error, id, className = '', ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');

  return (
    <div className={`ui-field ${error ? 'ui-field--error' : ''} ${className}`.trim()}>
      <label htmlFor={inputId}>{label}</label>
      {hint && <p className="ui-field__hint" id={hintId}>{hint}</p>}
      <input
        {...inputProps}
        id={inputId}
        className="ui-input"
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="ui-field__error" id={errorId}>{error}</p>}
    </div>
  );
}

export function PasswordField({ revealLabel, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const subject = revealLabel ?? props.label.toLowerCase();

  return (
    <div className="ui-password-field">
      <Field {...props} type={visible ? 'text' : 'password'} />
      <IconButton
        className="ui-password-field__toggle"
        label={`${visible ? 'Hide' : 'Show'} ${subject}`}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </IconButton>
    </div>
  );
}
