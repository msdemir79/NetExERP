import React from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const CONTROL_BASE = [
  'w-full rounded-control border bg-surface-raised px-3 py-2.5',
  'text-xs font-bold text-fg-strong outline-none transition-colors',
  'placeholder:font-semibold placeholder:text-fg-muted/70',
  'focus:border-brand focus:ring-2 focus:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

/** Form kontrollerinin ortak kabuğu; `invalid` ise kırmızı çerçeve. */
export function controlClass(invalid?: boolean) {
  return cn(CONTROL_BASE, invalid ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line');
}

/* ------------------------------------------------------------------ */
/* Etiket + hata sarmalayıcısı                                         */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Hata yoksa gösterilen yardımcı metin. */
  hint?: React.ReactNode;
  /** Dolu ise hint yerine kırmızı hata satırı gösterilir. */
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Etiket + kontrol + hata/ipucu üçlüsü. Hata metni satır içinde gösterilir;
 * `alert()` ile akış kesmeye gerek kalmaz.
 */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-label font-black uppercase tracking-widest text-fg-muted"
        >
          <span>{label}</span>
          {required ? <span className="text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-2xs font-bold text-danger">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-2xs font-semibold text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kontroller                                                          */
/* ------------------------------------------------------------------ */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  className?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(props: InputProps, ref) {
  const { invalid, className, ...rest } = props;
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlClass(invalid), className)} {...rest} />;
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  className?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  props: TextareaProps,
  ref,
) {
  const { invalid, className, ...rest } = props;
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass(invalid), 'min-h-20 resize-y', className)}
      {...rest}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  className?: string;
  children?: React.ReactNode;
  /** Sarmalayıcı div'in sınıfı (genişlik/yerleşim için). */
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(props: SelectProps, ref) {
  const { invalid, className, wrapperClassName, children, ...rest } = props;
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass(invalid), 'cursor-pointer appearance-none pr-8', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
    </div>
  );
});
