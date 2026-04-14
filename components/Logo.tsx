import React from "react";

export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const rx = Math.round(size * 0.25);
  const fontSize = Math.round(size * 0.5625);
  const cy = Math.round(size * 0.6875);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label="TaxBack IL logo mark"
    >
      <rect width={size} height={size} rx={rx} fill="#0B3B5C" />
      <text
        x={size / 2}
        y={cy}
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontFamily="Arial, sans-serif"
      >
        &#x20AA;
      </text>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={32} />
      <span className="text-sm font-semibold tracking-tight text-foreground">
        TaxBack{" "}
        <span style={{ color: "#F59E0B" }}>IL</span>
      </span>
    </span>
  );
}
