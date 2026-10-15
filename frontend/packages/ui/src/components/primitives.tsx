import { AlertTriangle, CheckCircle2, Info, Search, XCircle, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
export { cx };

/* ---------- Layout ---------- */

type Gap = { gap?: number; style?: CSSProperties };
const gapStyle = ({ gap, style }: Gap): CSSProperties | undefined =>
  gap === undefined ? style : { ...style, ["--dbx-gap" as string]: `${gap}px` };

export function Stack({ gap, style, className, ...rest }: HTMLAttributes<HTMLDivElement> & Gap) {
  return <div className={cx("dbx-stack", className)} style={gapStyle({ gap, style })} {...rest} />;
}

export function Row({
  gap,
  style,
  className,
  justify,
  wrap = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & Gap & { justify?: "between" | "end"; wrap?: boolean }) {
  return (
    <div
      className={cx("dbx-row", justify && `dbx-row--${justify}`, !wrap && "dbx-row--nowrap", className)}
      style={gapStyle({ gap, style })}
      {...rest}
    />
  );
}

export function Grid({
  columns = 2,
  kpi,
  gap,
  style,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & Gap & { columns?: number; kpi?: boolean }) {
  return (
    <div
      className={cx("dbx-grid", kpi && "dbx-grid--kpi", className)}
      style={{ ...gapStyle({ gap, style }), ["--dbx-cols" as string]: columns }}
      {...rest}
    />
  );
}

export function Page({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("dbx-page", className)} {...rest} />;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="dbx-page-header">
      <div className="dbx-page-header__text">
        {eyebrow && <div className="dbx-page-header__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="dbx-page-header__description">{description}</p>}
      </div>
      {actions && <div className="dbx-page-header__actions">{actions}</div>}
    </header>
  );
}

/* ---------- Card ---------- */

export function Card({
  title,
  subtitle,
  actions,
  footer,
  flush,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={cx("dbx-card", className)} {...rest}>
      {(title || actions) && (
        <div className="dbx-card__header">
          <div className="dbx-card__titles">
            {title && <h2>{title}</h2>}
            {subtitle && <div className="dbx-card__subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="dbx-card__actions">{actions}</div>}
        </div>
      )}
      <div className={cx("dbx-card__body", flush && "dbx-card__body--flush")}>{children}</div>
      {footer && <div className="dbx-card__footer">{footer}</div>}
    </section>
  );
}

/* ---------- Buttons ---------- */

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconOnly, loading, block, className, children, type = "button", disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "dbx-button",
        `dbx-button--${variant}`,
        size !== "md" && `dbx-button--${size}`,
        iconOnly && "dbx-button--icon",
        block && "dbx-button--block",
        className,
      )}
      {...rest}
    >
      {loading ? <span className="dbx-spinner" aria-hidden /> : Icon && <Icon aria-hidden />}
      {iconOnly ? <span className="dbx-sr-only">{children}</span> : children}
    </button>
  );
});

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; icon?: LucideIcon }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="dbx-segmented" role="group" aria-label={label}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {Icon && <Icon aria-hidden />}
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

/* ---------- Form controls ---------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="dbx-field">
      {htmlFor ? (
        <label className="dbx-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        // Groups (segmented controls, uploads) name themselves with aria-label.
        <div className="dbx-field__label">{label}</div>
      )}
      {children}
      {error ? <div className="dbx-field__error">{error}</div> : hint && <div className="dbx-field__hint">{hint}</div>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx("dbx-input", className)} {...rest} />;
});

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchInput({ className, ...rest }, ref) {
    return (
      <div className={cx("dbx-input-wrap", className)}>
        <Search aria-hidden />
        <input ref={ref} type="search" className="dbx-input" {...rest} />
      </div>
    );
  },
);

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("dbx-select", className)} {...rest} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx("dbx-textarea", className)} {...rest} />;
  },
);

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="dbx-checkbox">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

export function Switch({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="dbx-switch">
      <input type="checkbox" role="switch" {...rest} />
      <span>{label}</span>
    </label>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorInput({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="dbx-color-input">
      <input
        type="color"
        value={HEX.test(value) ? value : "#000000"}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label={ariaLabel ? `${ariaLabel} picker` : "Colour picker"}
      />
      <Input
        id={inputId}
        value={value}
        maxLength={7}
        aria-invalid={!HEX.test(value)}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/* ---------- Feedback ---------- */

export type Tone = "neutral" | "brand" | "good" | "warning" | "critical";

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cx("dbx-badge", tone !== "neutral" && `dbx-badge--${tone}`)} title={title}>
      {Icon && <Icon aria-hidden />}
      {children}
    </span>
  );
}

const ALERT_ICONS: Record<"info" | "good" | "warning" | "critical", LucideIcon> = {
  info: Info,
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "good" | "warning" | "critical";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={`dbx-alert dbx-alert--${tone}`} role={tone === "critical" ? "alert" : "status"}>
      <Icon aria-hidden />
      <div className="dbx-stack" style={{ ["--dbx-gap" as string]: "2px", flex: 1 }}>
        {title && <div className="dbx-alert__title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dbx-empty">
      {Icon && <Icon aria-hidden />}
      <div className="dbx-empty__title">{title}</div>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className="dbx-skeleton" style={{ width, height, ...style }} aria-hidden />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" style={{ display: "inline-flex" }}>
      <span className="dbx-spinner" aria-hidden />
      <span className="dbx-sr-only">{label}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="dbx-kbd">{children}</kbd>;
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <span className="dbx-avatar" aria-hidden>
      {initials || "?"}
    </span>
  );
}

export function KeyValue({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="dbx-kv">
      {items.map(([key, value], index) => (
        <div key={index} style={{ display: "contents" }}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
