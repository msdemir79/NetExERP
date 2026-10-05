import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE = [
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control',
  'font-bold whitespace-nowrap select-none transition-all duration-150',
  'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  '[&>svg]:shrink-0',
].join(' ');

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-card hover:bg-brand-hover',
  secondary: 'border border-line bg-surface text-fg-strong hover:border-line-strong hover:bg-surface-hover',
  subtle: 'bg-brand-soft text-brand-fg hover:bg-brand/15',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg-strong',
  danger: 'bg-rose-600 text-white shadow-card hover:bg-rose-700',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-xs',
  lg: 'h-10 px-4 text-sm',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0',
  md: 'h-9 w-9 p-0',
  lg: 'h-10 w-10 p-0',
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}

/**
 * Buton sınıflarını üretir. `Button` bileşenini kullanamayan yerler için
 * (ör. react-router `Link`) aynı görsel dili verir.
 */
export function buttonClass({ variant = 'secondary', size = 'md', iconOnly = false }: ButtonClassOptions = {}) {
  return cn(BASE, VARIANTS[variant], iconOnly ? ICON_SIZES[size] : SIZES[size]);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Yalnızca ikon: kare buton, 36px dokunma hedefi. */
  iconOnly?: boolean;
  loading?: boolean;
  block?: boolean;
  /** Solda görünen ikon (loading durumunda yerine spinner geçer). */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Uygulama genelindeki tek buton bileşeni. Varsayılan `type="button"`:
 * form içinde yanlışlıkla submit tetiklemez.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(props: ButtonProps, ref) {
  const {
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    loading = false,
    block = false,
    icon,
    iconRight,
    type = 'button',
    className,
    children,
    disabled,
    ...rest
  } = props;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, size, iconOnly }), block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export default Button;
