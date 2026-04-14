"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, HelpCircle, Award } from "lucide-react";
import { useApp } from "@/lib/appContext";

interface Question {
  id: string;
  text: string;
  subtext?: string;
  creditPoints: number; // how many points a "yes" adds
  creditLabel: string;
  onYes?: (taxpayer: ReturnType<typeof useApp>["state"]["taxpayer"]) => Partial<ReturnType<typeof useApp>["state"]["taxpayer"]> | null;
  alreadyApplied?: (taxpayer: ReturnType<typeof useApp>["state"]["taxpayer"]) => boolean;
}

const CREDIT_POINT_VALUE_2024 = 2904;

const QUESTIONS: Question[] = [
  {
    id: "discharge",
    text: "שירתת בצבא ושוחררת ב-3 השנים האחרונות?",
    subtext: "גברים: 2.0 נק' · נשים: 1.75 נק'",
    creditPoints: 2.0,
    creditLabel: "שחרור צבאי",
    alreadyApplied: (tp) => tp.dischargeYear !== undefined,
    onYes: () => null, // needs dischargeYear — flag for manual entry
  },
  {
    id: "aliyah",
    text: "עלית לישראל ב-5.5 השנים האחרונות?",
    subtext: "עולים חדשים זכאים ל-3-1 נקודות זיכוי",
    creditPoints: 3.0,
    creditLabel: "עולה חדש",
    alreadyApplied: (tp) => !!tp.aliyahDate,
    onYes: () => null,
  },
  {
    id: "daycare",
    text: "יש לך ילדים בגן ילדים מוכר (גיל 1-5)?",
    subtext: "2.0-2.5 נקודות לכל ילד בגן",
    creditPoints: 2.0,
    creditLabel: "ילד בגן",
    alreadyApplied: (tp) => tp.children.some((c) => c.inDaycare),
    onYes: (tp) => ({
      children: tp.children.map((c) => ({ ...c, inDaycare: true })),
    }),
  },
  {
    id: "single_parent",
    text: "אתה/את הורה עצמאי (גרוש/ה או אלמן/ה)?",
    subtext: "הורה עצמאי עם ילדים זכאי לנקודת זיכוי נוספת",
    creditPoints: 1.0,
    creditLabel: "הורה עצמאי",
    alreadyApplied: (tp) =>
      tp.maritalStatus === "divorced" || tp.maritalStatus === "widowed",
    onYes: () => ({
      maritalStatus: "divorced" as const,
    }),
  },
  {
    id: "disability",
    text: "יש לך נכות מוכרת על ידי ביטוח לאומי?",
    subtext: "נכות 20%+ מזכה ב-0.5-2.0 נקודות",
    creditPoints: 1.0,
    creditLabel: "נכות מוכרת",
    alreadyApplied: (tp) => !!tp.disabilityType,
    onYes: () => null,
  },
  {
    id: "periphery",
    text: "אתה/את מתגורר/ת בפריפריה?",
    subtext: "ערים כמו באר שבע, קריית שמונה, אילת, דימונה ועוד",
    creditPoints: 1.0,
    creditLabel: "ישוב פריפריה",
    alreadyApplied: (tp) => !!tp.postcode,
    onYes: () => null,
  },
  {
    id: "kibbutz",
    text: "אתה/את חבר/ת קיבוץ או מושב?",
    subtext: "0.25 נקודת זיכוי נוספת",
    creditPoints: 0.25,
    creditLabel: "קיבוץ/מושב",
    alreadyApplied: (tp) => !!tp.kibbutzMember,
    onYes: () => ({ kibbutzMember: true }),
  },
  {
    id: "degree_ba",
    text: "סיימת תואר ראשון לפני שנה בדיוק?",
    subtext: "0.5 נקודת זיכוי בשנה הראשונה לאחר הסיום",
    creditPoints: 0.5,
    creditLabel: "תואר ראשון",
    alreadyApplied: (tp) => tp.degrees.some((d) => d.type === "BA"),
    onYes: () => null,
  },
  {
    id: "degree_ma",
    text: "יש לך תואר שני (MA) שסיימת?",
    subtext: "0.5 נקודת זיכוי מהשנה שאחרי הסיום",
    creditPoints: 0.5,
    creditLabel: "תואר שני",
    alreadyApplied: (tp) => tp.degrees.some((d) => d.type === "MA"),
    onYes: () => null,
  },
  {
    id: "degree_phd",
    text: "יש לך דוקטורט שסיימת לפחות שנה?",
    subtext: "1.0 נקודת זיכוי בשנה הראשונה לאחר הסיום",
    creditPoints: 1.0,
    creditLabel: "דוקטורט",
    alreadyApplied: (tp) => tp.degrees.some((d) => d.type === "PHD"),
    onYes: () => null,
  },
  {
    id: "alimony",
    text: "שילמת מזונות השנה?",
    subtext: "מזונות מפחיתים את ההכנסה החייבת — סעיף 9א",
    creditPoints: 0.5,
    creditLabel: "מזונות (ניכוי הכנסה)",
    alreadyApplied: (tp) =>
      tp.personalDeductions.some((d) => d.type === "alimony_sec9a"),
    onYes: () => null,
  },
  {
    id: "life_insurance",
    text: "יש לך ביטוח חיים פרטי?",
    subtext: "25% זיכוי על פרמיה — סעיף 45א",
    creditPoints: 0.5,
    creditLabel: "ביטוח חיים",
    alreadyApplied: (tp) =>
      tp.personalDeductions.some((d) => d.type === "life_insurance_sec45a"),
    onYes: () => null,
  },
  {
    id: "ltc",
    text: "יש לך ביטוח סיעודי פרטי?",
    subtext: "25% זיכוי על פרמיה — סעיף 45א",
    creditPoints: 0.5,
    creditLabel: "ביטוח סיעודי",
    alreadyApplied: (tp) =>
      tp.personalDeductions.some((d) => d.type === "ltc_insurance_sec45a"),
    onYes: () => null,
  },
  {
    id: "pension_extra",
    text: "הפקדת לפנסיה/קופת גמל מעבר לניכוי המעסיק?",
    subtext: "35% זיכוי על הפקדה עצמאית — סעיף 47",
    creditPoints: 0.5,
    creditLabel: "פנסיה עצמאית",
    alreadyApplied: (tp) =>
      tp.personalDeductions.some((d) => d.type === "pension_sec47" || d.type === "provident_fund_sec47"),
    onYes: () => null,
  },
  {
    id: "disabled_child",
    text: "יש לך ילד עם צרכים מיוחדים?",
    subtext: "35% זיכוי על הוצאות עד ₪35,000 — סעיף 45",
    creditPoints: 1.0,
    creditLabel: "ילד עם צרכים מיוחדים",
    alreadyApplied: (tp) =>
      tp.personalDeductions.some((d) => d.type === "disabled_child_sec45"),
    onYes: () => null,
  },
];

type Answer = "yes" | "no" | "unsure";

export function CreditQuiz({ onClose }: { onClose?: () => void }) {
  const { state, updateTaxpayer } = useApp();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [discoveredItems, setDiscoveredItems] = useState<string[]>([]);
  const [discoveredPts, setDiscoveredPts] = useState(0);
  const [done, setDone] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Filter out already-applied questions
  const questions = QUESTIONS.filter(
    (q) => !q.alreadyApplied?.(state.taxpayer)
  );

  const handleAnswer = (answer: Answer) => {
    const q = questions[current];
    const newAnswers = { ...answers, [q.id]: answer };
    setAnswers(newAnswers);
    setDirection(1);

    if (answer === "yes") {
      // Apply immediate state change if available
      const patch = q.onYes?.(state.taxpayer);
      if (patch) {
        updateTaxpayer(patch as Partial<typeof state.taxpayer>);
      }
      setDiscoveredItems((prev) => [...prev, q.creditLabel]);
      setDiscoveredPts((prev) => prev + q.creditPoints);
    }

    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      setDone(true);
    }
  };

  const totalValue = Math.round(discoveredPts * CREDIT_POINT_VALUE_2024);

  if (questions.length === 0 || done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8 px-4 max-w-md mx-auto"
      >
        <div className="w-16 h-16 bg-accent-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Award className="w-8 h-8 text-accent-500" />
        </div>
        {discoveredPts > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              מצאנו לך עוד {discoveredPts.toFixed(2)} נקודות זיכוי!
            </h2>
            <p className="text-muted-foreground mb-4">
              שווה <span className="text-accent-500 font-bold text-xl">₪{totalValue.toLocaleString("he-IL")}</span> נוספים
            </p>
            <div className="bg-card border border-border rounded-2xl p-4 text-start space-y-2 mb-6">
              {discoveredItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-success-500 shrink-0" />
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              חלק מהפריטים דורשים הזנה ידנית בפרופיל — עדכן את הפרטים להשלמת החישוב.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">הכל מעודכן!</h2>
            <p className="text-muted-foreground mb-6">לא מצאנו נקודות זיכוי חדשות. הפרופיל שלך מלא.</p>
          </>
        )}
        <button
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
        >
          סגור
        </button>
      </motion.div>
    );
  }

  const q = questions[current];
  const progress = ((current) / questions.length) * 100;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-muted-foreground">{current + 1} / {questions.length}</span>
        <span className="text-sm font-medium text-accent-500">
          {discoveredPts > 0 ? `+${discoveredPts.toFixed(2)} נק'` : "גלה נקודות זיכוי"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 mb-6 min-h-[160px] flex flex-col justify-center"
        >
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            {q.creditLabel} · {q.creditPoints} נקודות
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">{q.text}</h3>
          {q.subtext && (
            <p className="text-sm text-muted-foreground">{q.subtext}</p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Answer buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => handleAnswer("no")}
          className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-border bg-card hover:border-danger-500/50 hover:bg-danger-500/5 transition-all"
        >
          <X className="w-6 h-6 text-danger-500" />
          <span className="text-sm font-medium text-foreground">לא</span>
        </button>
        <button
          onClick={() => handleAnswer("unsure")}
          className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-border bg-card hover:border-muted-foreground/50 transition-all"
        >
          <HelpCircle className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">לא יודע</span>
        </button>
        <button
          onClick={() => handleAnswer("yes")}
          className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-success-500/40 bg-success-500/5 hover:border-success-500 hover:bg-success-500/10 transition-all"
        >
          <Check className="w-6 h-6 text-success-500" />
          <span className="text-sm font-medium text-success-500">כן</span>
        </button>
      </div>
    </div>
  );
}
