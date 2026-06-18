type IconProps = { size?: number; className?: string };

export function HomeIcon({ size = 23, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M5 12.5L12 6l7 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 11v8h9v-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ListIcon({ size = 23, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M8 7h11M8 12h11M8 17h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function UploadIcon({ size = 23, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M12 15V6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.8 9.2L12 6l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M20 14.2A8 8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function SunIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ size = 12, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 4v4.5h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
