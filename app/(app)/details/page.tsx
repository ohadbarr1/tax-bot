"use client";
import Link from "next/link";
import { Shield } from "lucide-react";
import { AuthGate } from "@/components/auth/AuthGate";
import { useApp } from "@/lib/appContext";

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 99,
        background: "rgba(255,255,255,0.12)",
        color,
        border: `1px solid ${color}33`,
      }}
    >
      ✓ {label}
    </span>
  );
}

export default function DetailsPage() {
  return (
    <AuthGate>
      <DetailsViewInner />
    </AuthGate>
  );
}

function DetailsViewInner() {
  const { state } = useApp();
  const t = state.taxpayer;
  const displayName = t.fullName || `${t.firstName || ""} ${t.lastName || ""}`.trim() || "דוד כהן";
  const initial = displayName.trim()[0] || "ד";
  const idMasked = t.idNumber ? "•••••••" + t.idNumber.slice(-2) : "•••••••27";
  const tzSuffix = t.idNumber ? t.idNumber.slice(-2) : "27";
  const addr = t.address?.city
    ? `${t.address.street || ""} ${t.address.houseNumber || ""}, ${t.address.city}`.trim()
    : "ביאליק 42, רמת גן";
  const maritalLabel =
    t.maritalStatus === "married"
      ? `נשוי · ${(t.children || []).length} ילדים`
      : t.maritalStatus === "divorced"
        ? "גרוש"
        : t.maritalStatus === "widowed"
          ? "אלמן"
          : "רווק";
  const bankLabel = t.bank?.bankName
    ? `${t.bank.bankName} · חשבון •••${(t.bank.account || "").slice(-3) || "412"}`
    : "לאומי · חשבון •••412";

  const fields = [
    { label: "שם מלא", value: displayName, edit: false },
    { label: "תעודת זהות", value: idMasked, edit: false },
    { label: "תאריך לידה", value: "14 ביולי 1988", edit: false },
    { label: "טלפון", value: "050-•••-4829", edit: true },
    { label: "אימייל", value: "david.cohen@gmail.com", edit: true },
    { label: "כתובת", value: addr, edit: true },
    { label: "מצב משפחתי", value: maritalLabel, edit: true },
    { label: "בנק להחזר", value: bankLabel, edit: true },
  ];

  return (
    <div className="kc-rise" style={{ padding: "8px 40px 80px" }}>
      <div style={{ marginTop: 16, marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>הפרופיל שלך</div>
        <div
          style={{
            fontFamily: "var(--font-figtree)",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--kc-ink)",
            marginTop: 4,
            lineHeight: 1,
          }}
        >
          הכל במקום אחד
        </div>
      </div>

      <div
        style={{
          background: "var(--kc-ink)",
          color: "var(--kc-card)",
          borderRadius: 28,
          padding: "28px 32px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -80,
            insetInlineEnd: -60,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "var(--kc-lime)",
            opacity: 0.35,
            filter: "blur(24px)",
          }}
        />
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: "50%",
            position: "relative",
            background: `linear-gradient(135deg, var(--kc-coral), var(--kc-peach))`,
            display: "grid",
            placeItems: "center",
            fontSize: 32,
            fontWeight: 800,
            color: "#fff",
            fontFamily: "var(--font-figtree)",
          }}
        >
          {initial}
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontFamily: "var(--font-figtree)",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {displayName} · <span style={{ color: "var(--kc-lime)" }}>ת״ז ••{tzSuffix}</span>
          </div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            לקוח מאז ינואר 2024 · 3 שנים אחורה זכאיות להחזר
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            <Chip label="מאומת" color="var(--kc-lime)" />
            <Chip label="חתום דיגיטלית" color="var(--kc-grape)" />
            <Chip label="ייפוי כוח חתום" color="var(--kc-sky)" />
          </div>
        </div>
        <Link
          href="/questionnaire"
          style={{
            position: "relative",
            background: "var(--kc-lime)",
            color: "var(--kc-ink)",
            padding: "12px 20px",
            borderRadius: 99,
            fontSize: 13.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ערוך פרטים
        </Link>
      </div>

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {fields.map((f) => (
          <div
            key={f.label}
            style={{
              background: "var(--kc-card)",
              borderRadius: 18,
              padding: 18,
              border: "1px solid var(--kc-rule)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 11.5, color: "var(--kc-ink-dim)", fontWeight: 600, letterSpacing: "0.02em" }}>
              {f.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 15.5, color: "var(--kc-ink)", fontWeight: 600, flex: 1 }}>{f.value}</div>
              {f.edit && (
                <button
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 11.5,
                    color: "var(--kc-ink-dim)",
                    padding: "4px 10px",
                    background: "var(--kc-bg-soft)",
                    borderRadius: 99,
                    fontWeight: 600,
                  }}
                >
                  ערוך
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          background: "var(--kc-lime-soft)",
          borderRadius: 22,
          padding: 22,
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "var(--kc-lime)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Shield size={22} style={{ color: "var(--kc-ink)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--kc-ink)" }}>
            הפרטים שלך מוצפנים מקצה לקצה
          </div>
          <div style={{ fontSize: 13, color: "var(--kc-ink-soft)", marginTop: 4, lineHeight: 1.5 }}>
            אנחנו משתמשים בפרטים רק לצורך הגשת החזר המס. לא שולחים, לא מוכרים, לא משתפים.
          </div>
        </div>
        <Link
          href="/privacy"
          style={{ fontSize: 13, fontWeight: 700, color: "var(--kc-ink)", textDecoration: "none" }}
        >
          מדיניות פרטיות ←
        </Link>
      </div>
    </div>
  );
}
