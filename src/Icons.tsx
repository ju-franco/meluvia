import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Tamanho do ícone. Por padrão acompanha o font-size do elemento pai (1em). */
  size?: number | string;
};

function Svg({ size = "1em", className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** ↗ */
export function IconArrowUpRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </Svg>
  );
}

/** ← */
export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </Svg>
  );
}

/** ♥ / ♡ — use filled para o coração cheio */
export function IconHeart({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5s-7.5-4.6-9.4-9.4C1.4 8 3.2 4.8 6.5 4.8c2 0 3.4 1 5.5 3.1 2.1-2.1 3.5-3.1 5.5-3.1 3.3 0 5.1 3.2 3.9 6.3-1.9 4.8-9.4 9.4-9.4 9.4z" />
    </Svg>
  );
}

/** ♫ */
export function IconMusic(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Svg>
  );
}

/** ✦ */
export function IconSparkle(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor">
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
    </Svg>
  );
}

/** ◉ */
export function IconTarget(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </Svg>
  );
}

/** ✳ — mapa de conexões */
export function IconNetwork(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6.5h8" />
      <path d="M7 8.5l4 7" />
      <path d="M17 8.5l-4 7" />
      <circle cx="6" cy="6.5" r="2.5" fill="currentColor" />
      <circle cx="18" cy="6.5" r="2.5" fill="currentColor" />
      <circle cx="12" cy="18" r="2.5" fill="currentColor" />
    </Svg>
  );
}

/** ⌕ */
export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Svg>
  );
}

/** × / ✕ */
export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

/** + */
export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

/** ••• */
export function IconDots(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </Svg>
  );
}

/** ↻ */
export function IconReplay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </Svg>
  );
}
