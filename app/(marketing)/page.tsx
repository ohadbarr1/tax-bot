import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TaxBack IL — החזר מס חכם לשכירים בישראל",
  description: "פלטפורמה חכמה להחזר מס לשכירים בישראל. ממלאים שאלון, מעלים טפסים, מקבלים PDF מוכן. ממוצע החזר: ₪18,500.",
};

const PILLARS = [
  { icon: "🔗", title: "תיאום מס בין מעסיקים", desc: "חפיפה בין מעסיקים ללא תיאום גורמת לגביית יתר. נאתר ונחזיר." },
  { icon: "💳", title: "ניכויים וסעיפי מס", desc: "תרומות, ביטוח חיים, פנסיה עצמאית — כל ניכוי שמגיע לכם." },
  { icon: "⭐", title: "נקודות זיכוי", desc: "ילדים, תואר, שירות צבאי, עלייה — ניבדוק שכל הנקודות מנוצלות." },
  { icon: "💼", title: "פיצויים ופרישה", desc: "פריסת מס על פיצויים חייבים יכולה לחסוך אלפי שקלים." },
  { icon: "📈", title: "שוק ההון", desc: "רווחי הון, דיבידנדים ומס זר — חישוב מדויק עם קיזוז הפסדים." },
];

export default function LandingPage() {
  return (
    <div className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="bg-[#0B3B5C] dark:bg-[#0D1B2E] py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <span className="inline-block bg-white/10 text-white/80 text-xs font-semibold px-3 py-1 rounded-full mb-2">
            🇮🇱 מותאם לדין הישראלי · שנת מס 2024
          </span>
          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
            מקסמו את<br />
            <span className="text-[#F59E0B]">החזר המס שלכם</span>
          </h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
            שאלון חכם + OCR אוטומטי + חישוב מס מקיף = טופס 135 מוכן להגשה.
            ממוצע החזר: <strong className="text-white">₪18,500</strong>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            <Link
              href="/welcome"
              className="bg-[#F59E0B] text-[#0C0A09] font-bold px-8 py-4 rounded-2xl text-base hover:opacity-90 transition-opacity shadow-lg"
            >
              התחל עכשיו — בחינם ←
            </Link>
            <Link
              href="/how-it-works"
              className="bg-white/10 text-white font-semibold px-8 py-4 rounded-2xl text-base hover:bg-white/20 transition-colors"
            >
              איך זה עובד?
            </Link>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ──────────────────────────────────────────────── */}
      <section className="bg-[#0F5A8A] dark:bg-[#1E3450] py-4 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 text-center">
          {[
            { val: "₪18,500", label: "החזר ממוצע" },
            { val: "3 דקות", label: "לשאלון" },
            { val: "100%", label: "מאובטח" },
            { val: "2024", label: "עדכני לשנת מס" },
          ].map(s => (
            <div key={s.label} className="text-white">
              <p className="text-2xl font-black text-[#F59E0B]">{s.val}</p>
              <p className="text-xs text-white/70">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5 pillars ───────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-background">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-2">5 עמודי ההחזר</h2>
          <p className="text-muted-foreground text-center mb-10 text-sm">מרבית השכירים בישראל מפספסים לפחות 2 מהם</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PILLARS.map((p) => (
              <div key={p.title} className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow">
                <div className="text-3xl mb-3">{p.icon}</div>
                <h3 className="font-bold text-foreground mb-1">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 steps ─────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-10">3 שלבים פשוטים</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { n: "01", title: "שאלון 3 דקות", desc: "פרטים אישיים, ילדים, מעסיקים, ניכויים" },
              { n: "02", title: "העלו מסמכים", desc: "טופס 106, Activity Statement — OCR אוטומטי" },
              { n: "03", title: "קבלו PDF", desc: "טופס 135 מוכן לחתימה ולהגשה" },
            ].map(s => (
              <div key={s.n} className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground text-xl font-black flex items-center justify-center mx-auto">
                  {s.n}
                </div>
                <h3 className="font-bold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-background text-center">
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-3xl font-black text-foreground">התחילו עכשיו — בחינם</h2>
          <p className="text-muted-foreground">ללא כרטיס אשראי · ללא התחייבות · נתונים מאובטחים מקומית</p>
          <Link
            href="/welcome"
            className="inline-block bg-[#F59E0B] text-[#0C0A09] font-bold px-10 py-4 rounded-2xl text-base hover:opacity-90 transition-opacity shadow-lg mt-2"
          >
            צאו לדרך ←
          </Link>
        </div>
      </section>
    </div>
  );
}
