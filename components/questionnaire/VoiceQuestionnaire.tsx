"use client";

/**
 * VoiceQuestionnaire — voice-driven intake for the Israeli tax questionnaire.
 *
 * Uses the Web Speech API (SpeechRecognition) to capture spoken answers and
 * maps them onto the TaxPayer / FinancialData shape via useApp().
 *
 * Flow:
 *   1. A question is read aloud via SpeechSynthesis (optional, toggled).
 *   2. The user taps the microphone button and speaks their answer.
 *   3. The transcript is shown for confirmation.
 *   4. On confirm, the answer is parsed and committed to app state.
 *   5. Next question auto-advances.
 *
 * Supported questions (7):
 *   Q1  — marital status
 *   Q2  — children count / birth years
 *   Q3  — number of employers
 *   Q4  — has academic degree?
 *   Q5  — capital-markets investing?
 *   Q6  — has personal deductions?
 *   Q7  — life events (job change / severance)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, ChevronLeft, ChevronRight, Check, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/appContext";
import { cn } from "@/lib/utils";
import type { Child, LifeEvent } from "@/types";

// ─── Web Speech API shims ──────────────────────────────────────────────────────

interface ISpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

// ─── Question definitions ──────────────────────────────────────────────────────

interface Question {
  id: string;
  text: string;                  // shown in card
  prompt: string;                // read aloud
  hint: string;                  // placeholder hint under mic
  parse: (transcript: string, ctx: ParseContext) => ParseResult;
}

interface ParseContext {
  children: Child[];
}

interface ParseResult {
  display: string;               // human-readable confirmation
  // typed patches — only the relevant ones are set
  maritalStatus?: "single" | "married" | "divorced" | "widowed";
  children?: Child[];
  employersCount?: number;
  hasDegree?: boolean;
  investsCapital?: boolean;
  hasDeductions?: boolean;
  lifeEvents?: Partial<LifeEvent>;
}

const QUESTIONS: Question[] = [
  {
    id: "q_marital",
    text: "מה המצב המשפחתי שלך?",
    prompt: "מה המצב המשפחתי שלך? אמור: רווק, נשוי, גרוש, או אלמן.",
    hint: "לדוגמה: \"נשוי\" או \"רווק\"",
    parse(t) {
      const lower = t.toLowerCase();
      let maritalStatus: ParseResult["maritalStatus"] = "single";
      let display = "רווק/ה";
      if (lower.includes("נשוי") || lower.includes("נשואה") || lower.includes("married")) {
        maritalStatus = "married"; display = "נשוי/אה";
      } else if (lower.includes("גרוש") || lower.includes("גרושה") || lower.includes("divorced")) {
        maritalStatus = "divorced"; display = "גרוש/ה";
      } else if (lower.includes("אלמן") || lower.includes("אלמנה") || lower.includes("widowed")) {
        maritalStatus = "widowed"; display = "אלמן/ה";
      }
      return { display, maritalStatus };
    },
  },
  {
    id: "q_children",
    text: "כמה ילדים יש לך ומתי נולדו?",
    prompt: "כמה ילדים יש לך? אם יש, אמור את שנות הלידה שלהם.",
    hint: "לדוגמה: \"שני ילדים, 2018 ו-2021\"",
    parse(t) {
      const lower = t.toLowerCase();
      const children: Child[] = [];

      if (lower.includes("אין") || lower.includes("לא") || lower.includes("zero") || lower.includes("no ")) {
        return { display: "אין ילדים", children: [] };
      }

      // Extract years that look like birth years (2000-2025)
      const yearMatches = t.match(/\b(20[0-2][0-9]|199[0-9])\b/g) ?? [];
      if (yearMatches.length > 0) {
        yearMatches.forEach((y, i) => {
          children.push({ id: `voice-child-${i}-${Date.now()}`, birthDate: `${y}-01-01` });
        });
        return { display: `${children.length} ילדים (${yearMatches.join(", ")})`, children };
      }

      // Numeric words
      const numMap: Record<string, number> = {
        "אחד": 1, "אחת": 1, "שניים": 2, "שתיים": 2, "שלושה": 3, "שלוש": 3,
        "ארבעה": 4, "ארבע": 4, "חמישה": 5, "חמש": 5,
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
      };
      for (const [word, num] of Object.entries(numMap)) {
        if (lower.includes(word)) {
          for (let i = 0; i < num; i++) {
            children.push({ id: `voice-child-${i}-${Date.now()}`, birthDate: "" });
          }
          return { display: `${num} ילדים`, children };
        }
      }
      // digit
      const digit = t.match(/\b([1-9])\b/)?.[1];
      if (digit) {
        const n = parseInt(digit, 10);
        for (let i = 0; i < n; i++) {
          children.push({ id: `voice-child-${i}-${Date.now()}`, birthDate: "" });
        }
        return { display: `${n} ילדים`, children };
      }

      return { display: "לא זוהו ילדים — נסה שוב", children: [] };
    },
  },
  {
    id: "q_employers",
    text: "אצל כמה מעסיקים עבדת השנה?",
    prompt: "אצל כמה מעסיקים עבדת בשנת המס? אמור מספר.",
    hint: "לדוגמה: \"מעסיק אחד\" או \"שניים\"",
    parse(t) {
      const lower = t.toLowerCase();
      const numMap: Record<string, number> = {
        "אחד": 1, "אחת": 1, "שניים": 2, "שתיים": 2, "שלושה": 3, "שלוש": 3,
        "ארבעה": 4, "ארבע": 4, "one": 1, "two": 2, "three": 3, "four": 4,
      };
      for (const [word, num] of Object.entries(numMap)) {
        if (lower.includes(word)) return { display: `${num} מעסיקים`, employersCount: num };
      }
      const digit = t.match(/\b([1-9])\b/)?.[1];
      if (digit) {
        const n = parseInt(digit, 10);
        return { display: `${n} מעסיקים`, employersCount: n };
      }
      return { display: "מעסיק אחד (ברירת מחדל)", employersCount: 1 };
    },
  },
  {
    id: "q_degree",
    text: "האם יש לך תואר אקדמי?",
    prompt: "האם יש לך תואר אקדמי? אמור כן או לא.",
    hint: "\"כן\" או \"לא\"",
    parse(t) {
      const lower = t.toLowerCase();
      const hasDegree = lower.includes("כן") || lower.includes("yes") || lower.includes("יש");
      return { display: hasDegree ? "כן, יש תואר" : "לא, אין תואר", hasDegree };
    },
  },
  {
    id: "q_capital",
    text: "האם השקעת בשוק ההון (מניות, קרנות)?",
    prompt: "האם השקעת בשוק ההון השנה? לדוגמה: מניות, קרנות, או תעודות סל.",
    hint: "\"כן\" או \"לא\"",
    parse(t) {
      const lower = t.toLowerCase();
      const investsCapital = lower.includes("כן") || lower.includes("yes") || lower.includes("יש") || lower.includes("כן השקעתי");
      return { display: investsCapital ? "כן, השקעתי בשוק ההון" : "לא", investsCapital };
    },
  },
  {
    id: "q_deductions",
    text: "האם יש לך ניכויים אישיים? (תרומות, ביטוח חיים, פנסיה עצמאית)",
    prompt: "האם יש לך ניכויים אישיים השנה? לדוגמה: תרומות לפי סעיף 46, ביטוח חיים, או פנסיה עצמאית.",
    hint: "\"כן\" או \"לא\"",
    parse(t) {
      const lower = t.toLowerCase();
      const hasDeductions = lower.includes("כן") || lower.includes("yes") || lower.includes("יש");
      return { display: hasDeductions ? "כן, יש ניכויים" : "לא", hasDeductions };
    },
  },
  {
    id: "q_lifeevents",
    text: "האם החלפת מקום עבודה או קיבלת פיצויי פיטורים השנה?",
    prompt: "האם קרה אחד מהדברים הבאים השנה: החלפת מקום עבודה, או קיבלת פיצויי פיטורים?",
    hint: "לדוגמה: \"החלפתי עבודה\" או \"לא\"",
    parse(t) {
      const lower = t.toLowerCase();
      const changedJobs = lower.includes("החלפתי") || lower.includes("עזבתי") || lower.includes("changed") || lower.includes("עבודה");
      const pulledSeverancePay = lower.includes("פיצויים") || lower.includes("פיטורים") || lower.includes("severance");
      const hasForm161 = pulledSeverancePay;
      const parts: string[] = [];
      if (changedJobs) parts.push("החלפת עבודה");
      if (pulledSeverancePay) parts.push("פיצויי פיטורים");
      return {
        display: parts.length > 0 ? parts.join(" + ") : "ללא אירועי חיים",
        lifeEvents: { changedJobs, pulledSeverancePay, hasForm161 },
      };
    },
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type StepStatus = "idle" | "listening" | "confirming" | "done";

interface StepState {
  transcript: string;
  result: ParseResult | null;
  status: StepStatus;
}

function makeInitialSteps(): StepState[] {
  return QUESTIONS.map(() => ({ transcript: "", result: null, status: "idle" }));
}

export function VoiceQuestionnaire() {
  const { updateTaxpayer, updateFinancials, completeQuestionnaire, state } = useApp();

  const [currentQ, setCurrentQ] = useState(0);
  const [steps, setSteps] = useState<StepState[]>(makeInitialSteps);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // ── Check browser support ────────────────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) setSupported(false);
  }, []);

  // ── TTS helper ───────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "he-IL";
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  }, [ttsEnabled]);

  // ── Auto-speak question on advance ───────────────────────────────────────────
  useEffect(() => {
    if (currentQ < QUESTIONS.length && ttsEnabled) {
      speak(QUESTIONS[currentQ].prompt);
    }
  }, [currentQ, ttsEnabled, speak]);

  // ── Start / stop recording ───────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    setSteps((prev) => prev.map((s, i) => i === currentQ ? { ...s, status: "listening", transcript: "" } : s));

    const recognition = new SR();
    recognition.lang = "he-IL";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: ISpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      const q = QUESTIONS[currentQ];
      const result = q.parse(transcript, { children: state.taxpayer.children });
      setSteps((prev) =>
        prev.map((s, i) => i === currentQ ? { transcript, result, status: "confirming" } : s)
      );
    };

    recognition.onerror = () => {
      setSteps((prev) =>
        prev.map((s, i) => i === currentQ ? { ...s, status: "idle" } : s)
      );
    };

    recognition.onend = () => {
      setSteps((prev) =>
        prev.map((s, i) => i === currentQ && s.status === "listening" ? { ...s, status: "idle" } : s)
      );
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [currentQ, state.taxpayer.children]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Confirm answer and advance ────────────────────────────────────────────────
  const confirmAnswer = useCallback(() => {
    const step = steps[currentQ];
    if (!step.result) return;

    setSteps((prev) => prev.map((s, i) => i === currentQ ? { ...s, status: "done" } : s));

    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ((q) => q + 1);
    }
  }, [currentQ, steps]);

  const retryQuestion = useCallback(() => {
    setSteps((prev) =>
      prev.map((s, i) => i === currentQ ? { transcript: "", result: null, status: "idle" } : s)
    );
  }, [currentQ]);

  // ── Commit all answers and complete questionnaire ─────────────────────────────
  const finishVoice = useCallback(() => {
    const answers = steps.map((s) => s.result);

    // Q0 — marital status
    if (answers[0]?.maritalStatus) {
      updateTaxpayer({ maritalStatus: answers[0].maritalStatus });
    }
    // Q1 — children
    if (answers[1]?.children !== undefined) {
      updateTaxpayer({ children: answers[1].children });
    }
    // Q2 — employers
    if (answers[2]?.employersCount !== undefined) {
      updateFinancials({ employersCount: answers[2].employersCount });
      const count = answers[2].employersCount;
      const employers = Array.from({ length: count }, (_, i) => ({
        id: `emp-voice-${i}`,
        name: "",
        isMainEmployer: i === 0,
        monthsWorked: 12,
      }));
      updateTaxpayer({ employers });
    }
    // Q3 — degree (just log, not enough info for Degree[] object)
    // Q4 — capital markets
    if (answers[4]?.investsCapital !== undefined) {
      updateFinancials({ hasForeignBroker: false });
    }
    // Q6 — life events
    if (answers[6]?.lifeEvents) {
      updateTaxpayer({
        lifeEvents: {
          changedJobs: answers[6].lifeEvents.changedJobs ?? false,
          pulledSeverancePay: answers[6].lifeEvents.pulledSeverancePay ?? false,
          hasForm161: answers[6].lifeEvents.hasForm161 ?? false,
        },
      });
    }

    completeQuestionnaire();
  }, [steps, updateTaxpayer, updateFinancials, completeQuestionnaire]);

  const currentStep = steps[currentQ];
  const isLastQuestion = currentQ === QUESTIONS.length - 1;
  const allAnswered = steps.every((s) => s.status === "done");

  if (!supported) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <MicOff className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <h2 className="text-lg font-semibold text-foreground">הדפדפן אינו תומך בקלט קולי</h2>
        <p className="text-sm text-muted-foreground">
          השתמש ב-Chrome או Edge לחוויה מלאה. באפשרותך למלא את השאלון הכתוב במקום.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">שאלון קולי</h1>
          <p className="text-sm text-muted-foreground">שאלה {currentQ + 1} מתוך {QUESTIONS.length}</p>
        </div>
        <button
          onClick={() => setTtsEnabled((v) => !v)}
          title={ttsEnabled ? "כבה הקראה" : "הפעל הקראה"}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          {ttsEnabled ? <Volume2 className="w-5 h-5 text-muted-foreground" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 bg-primary rounded-full transition-all duration-500"
          style={{ width: `${((currentQ + 1) / QUESTIONS.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm p-8 space-y-6"
        >
          {/* Question text */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">שאלה {currentQ + 1}</p>
            <h2 className="text-lg font-bold text-foreground">{QUESTIONS[currentQ].text}</h2>
            <p className="text-xs text-muted-foreground">{QUESTIONS[currentQ].hint}</p>
          </div>

          {/* Mic area */}
          <div className="flex flex-col items-center gap-5 py-4">
            {currentStep.status === "idle" && (
              <button
                onClick={startListening}
                className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
              >
                <Mic className="w-9 h-9 text-primary-foreground" />
              </button>
            )}

            {currentStep.status === "listening" && (
              <button
                onClick={stopListening}
                className="w-20 h-20 rounded-full bg-rose-500 flex items-center justify-center shadow-lg animate-pulse hover:bg-rose-600 active:scale-95 transition-all"
              >
                <MicOff className="w-9 h-9 text-white" />
              </button>
            )}

            {(currentStep.status === "confirming" || currentStep.status === "done") && (
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center shadow",
                currentStep.status === "done" ? "bg-success-500" : "bg-muted"
              )}>
                <Check className={cn(
                  "w-9 h-9",
                  currentStep.status === "done" ? "text-white" : "text-muted-foreground"
                )} />
              </div>
            )}

            {/* Status label */}
            <p className="text-sm text-muted-foreground text-center">
              {currentStep.status === "idle" && "לחץ על המיקרופון ודבר"}
              {currentStep.status === "listening" && (
                <span className="text-rose-500 font-medium">מקשיב... לחץ להפסיק</span>
              )}
              {currentStep.status === "confirming" && "בדוק ואשר"}
              {currentStep.status === "done" && "נשמר"}
            </p>
          </div>

          {/* Transcript + confirm */}
          <AnimatePresence>
            {currentStep.status === "confirming" && currentStep.result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-3"
              >
                <div className="bg-muted/50 rounded-xl p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">שמעתי:</p>
                  <p className="text-sm font-medium text-foreground">"{currentStep.transcript}"</p>
                  <p className="text-xs text-muted-foreground mt-1">זוהה:</p>
                  <p className="text-sm font-semibold text-primary">{currentStep.result.display}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={retryQuestion}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    נסה שוב
                  </button>
                  <button
                    onClick={confirmAnswer}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isLastQuestion ? "סיים" : "אשר והמשך"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {/* Previous answers summary */}
      {steps.slice(0, currentQ).some((s) => s.status === "done") && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">תשובות קודמות:</p>
          {steps.slice(0, currentQ).map((s, i) =>
            s.status === "done" && s.result ? (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-xl text-xs">
                <Check className="w-3 h-3 text-success-500 shrink-0" />
                <span className="text-muted-foreground">{QUESTIONS[i].text.replace("?", "")}:</span>
                <span className="font-medium text-foreground">{s.result.display}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Navigation row */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
          disabled={currentQ === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
          חזרה
        </button>

        {allAnswered ? (
          <button
            onClick={finishVoice}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200"
          >
            <Check className="w-4 h-4" />
            סיים ועבור לדוח
          </button>
        ) : (
          <button
            onClick={() => setCurrentQ((q) => Math.min(QUESTIONS.length - 1, q + 1))}
            disabled={currentQ === QUESTIONS.length - 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors"
          >
            דלג
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default VoiceQuestionnaire;
