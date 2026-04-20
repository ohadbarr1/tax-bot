import Link from "next/link";

export default function NotFound() {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--kc-bg, #fafaf7)",
        fontFamily: "var(--font-heebo), system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1,
            color: "var(--kc-ink, #1a1a1f)",
            letterSpacing: "-0.04em",
          }}
        >
          404
        </div>
        <h1
          style={{
            marginTop: 12,
            fontSize: 22,
            fontWeight: 700,
            color: "var(--kc-ink, #1a1a1f)",
          }}
        >
          הדף שחיפשת לא קיים
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "var(--kc-ink-dim, #6b6b74)",
            lineHeight: 1.6,
          }}
        >
          ייתכן שהקישור ישן או שהדף הוסר. חזור ללוח המחוונים כדי להמשיך.
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center" }}>
          <Link
            href="/dashboard"
            style={{
              background: "var(--kc-lime, #c7f266)",
              color: "var(--kc-ink, #1a1a1f)",
              padding: "10px 20px",
              borderRadius: 99,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            חזרה ללוח המחוונים
          </Link>
          <Link
            href="/"
            style={{
              color: "var(--kc-ink-dim, #6b6b74)",
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            לעמוד הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
