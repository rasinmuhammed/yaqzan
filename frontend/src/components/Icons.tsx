import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function Svg({ size = 14, className, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export function ActionIcon({ action, size, className, style }: IconProps & { action: string }) {
  switch (action) {
    case "evacuate":
      return (
        <Svg size={size} className={className} style={style}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </Svg>
      );
    case "move_unit":
    case "stage_resource":
      return (
        <Svg size={size} className={className} style={style}>
          <path d="M3 11l19-9-9 19-2-8z" />
        </Svg>
      );
    case "open_shelter":
      return (
        <Svg size={size} className={className} style={style}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
        </Svg>
      );
    case "close_route":
      return (
        <Svg size={size} className={className} style={style}>
          <circle cx="12" cy="12" r="9" />
          <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
        </Svg>
      );
    case "broadcast_alert":
      return (
        <Svg size={size} className={className} style={style}>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
          <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
          <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
          <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
        </Svg>
      );
    case "medical_priority":
      return (
        <Svg size={size} className={className} style={style}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </Svg>
      );
    default:
      return (
        <Svg size={size} className={className} style={style}>
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </Svg>
      );
  }
}

export function StatusDot({ tone }: { tone: "ok" | "rejected" | "pending" }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "rejected" ? "var(--danger-hot)" : "var(--ink-dim)";
  return (
    <span
      className="inline-block h-[6px] w-[6px] rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}
