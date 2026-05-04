import React from "react";

export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const rx = Math.round(size * 0.3);
  const fontSize = Math.round(size * 0.55);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label="כסף חזרה"
    >
      <rect width={size} height={size} rx={rx} fill="var(--kc-ink)" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--kc-lime)"
        fontSize={fontSize}
        fontWeight={800}
        fontFamily="Figtree, system-ui, sans-serif"
      >
        &#x20AA;
      </text>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className ?? ""}`}
      style={{ fontFamily: "var(--font-figtree)" }}
    >
      <LogoMark size={36} />
      <span
        className="font-extrabold leading-none tracking-[-0.02em]"
        style={{ color: "var(--kc-ink)", fontSize: 19 }}
      >
        כסף<span style={{ color: "var(--kc-lime-dark)" }}>חזרה</span>
      </span>
    </span>
  );
}
