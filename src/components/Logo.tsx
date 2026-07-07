import logoUrl from '../assets/greentouch-logo.jpg';

/**
 * GreenTouch.Pro brand mark.
 * `variant="mark"` → just the logo tile (square, rounded).
 * `variant="full"` → logo + wordmark lockup.
 */
export function Logo({
  size = 36,
  variant = 'mark',
  className = '',
}: {
  size?: number;
  variant?: 'mark' | 'full';
  className?: string;
}) {
  const mark = (
    <img
      src={logoUrl}
      alt="GreenTouch.Pro"
      width={size}
      height={size}
      className="rounded-xl object-cover shadow-glow shrink-0"
      style={{ width: size, height: size }}
    />
  );

  if (variant === 'mark') return <span className={className}>{mark}</span>;

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      {mark}
      <span className="leading-none">
        <span className="font-extrabold text-lg tracking-tight">
          GreenTouch<span className="text-brand">.Pro</span>
        </span>
        <span className="block text-[10px] text-muted mt-1 tracking-[0.2em] uppercase">
          Connect · Organize · Build
        </span>
      </span>
    </span>
  );
}

export default Logo;
