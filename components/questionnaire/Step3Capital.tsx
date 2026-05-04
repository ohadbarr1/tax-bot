"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Label, WarnBox, TogglePair } from "./StepShell";
import { useApp } from "@/lib/appContext";

const BROKERS = ["Interactive Brokers", "Charles Schwab", "Tastytrade", "אחר"];

interface Props {
  investsCapital: boolean;
  portfolioLocation: "bank" | "local_broker" | "foreign_broker" | null;
  selectedBroker: string;
  onInvestsCapitalChange: (v: boolean) => void;
  onPortfolioLocationChange: (v: "bank" | "local_broker" | "foreign_broker") => void;
  onSelectedBrokerChange: (v: string) => void;
}

export default function Step3Capital({
  investsCapital,
  portfolioLocation,
  selectedBroker,
  onInvestsCapitalChange,
  onPortfolioLocationChange,
  onSelectedBrokerChange,
}: Props) {
  const { state } = useApp();
  // T4: heuristic default for portfolio location when the user flips to yes.
  // If onboarding declared foreign investments/income, assume foreign_broker;
  // otherwise default to local_broker so the reveal panel doesn't look empty.
  const onboardingSources = state.onboarding?.sources ?? [];
  const defaultLocation: "local_broker" | "foreign_broker" =
    onboardingSources.includes("foreign") || onboardingSources.includes("investments")
      ? "foreign_broker"
      : "local_broker";
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-kc-ink">שוק ההון</h2>
        <p className="mt-1 text-sm text-slate-500">
          ניהול תיק השקעות עצמאי עשוי לחייב הגשת דוח נפרד.
        </p>
      </div>

      <div className="space-y-2">
        <Label>האם סחרת בשוק ההון באופן עצמאי?</Label>
        <TogglePair
          value={investsCapital}
          onChange={(v) => {
            onInvestsCapitalChange(v);
            // T4: on "yes" pre-select the most likely portfolio location so
            // the reveal panel has something highlighted — users who missed
            // the radio group reported feeling like nothing happened.
            if (v && portfolioLocation === null) {
              onPortfolioLocationChange(defaultLocation);
            }
          }}
        />
      </div>

      <AnimatePresence>
        {investsCapital && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-4"
          >
            <div className="space-y-2">
              <Label>היכן מנוהל תיק ההשקעות?</Label>
              {[
                { v: "bank",           l: "בנק ישראלי",  note: null },
                { v: "local_broker",   l: "ברוקר ישראלי", note: null },
                { v: "foreign_broker", l: "ברוקר זר",    note: "דורש הגשת דוח רווחי הון בנפרד עם טופס 1322." },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() =>
                    onPortfolioLocationChange(
                      opt.v as "bank" | "local_broker" | "foreign_broker"
                    )
                  }
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-start ${
                    portfolioLocation === opt.v
                      ? "bg-kc-ink text-white border-kc-ink"
                      : "bg-background dark:bg-secondary text-foreground border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      portfolioLocation === opt.v
                        ? "border-white"
                        : "border-slate-300"
                    }`}
                  >
                    {portfolioLocation === opt.v && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                  <span>{opt.l}</span>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {portfolioLocation === "foreign_broker" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-3"
                >
                  <Label>בחר ברוקר</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {BROKERS.map((b) => (
                      <button
                        key={b}
                        onClick={() => onSelectedBrokerChange(b)}
                        className={`text-start px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          selectedBroker === b
                            ? "bg-kc-ink text-white border-kc-ink"
                            : "bg-background dark:bg-secondary text-foreground border-border hover:border-muted-foreground/40"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  {selectedBroker === "Interactive Brokers" && (
                    <WarnBox>
                      יש להעלות Activity Statement (CSV) לחישוב רווחי הון וזיכוי מס
                      זר שנוכה בגין דיבידנדים אמריקאיים.
                    </WarnBox>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
