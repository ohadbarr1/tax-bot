"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { AuthGate } from "@/components/auth/AuthGate";
import { QuestionnaireProvider } from "@/lib/questionnaireContext";
import { STEP_CONFIG, getStepBySlug } from "@/lib/questionnaireSteps";

export default function QuestionnaireLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const slug = pathname.split("/").pop() ?? "personal";
  const currentStepId = getStepBySlug(slug)?.id ?? 1;

  return (
    <AuthGate>
      <QuestionnaireProvider>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          {/* ── Step indicator ── */}
          <div className="mb-10">
            <div className="relative flex items-start justify-between">
              <div className="absolute top-5 start-[4%] end-[4%] h-0.5 bg-border -z-0" />
              {STEP_CONFIG.map((s) => {
                const Icon = s.icon;
                const done = currentStepId > s.id;
                const active = currentStepId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex flex-col items-center gap-1.5 z-10 w-[12.5%]"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        done
                          ? "bg-[#0F172A] dark:bg-brand-700 border-[#0F172A] dark:border-brand-700 text-white"
                          : active
                            ? "bg-background border-[#0F172A] dark:border-brand-700 text-foreground shadow-md"
                            : "bg-background border-border text-muted-foreground"
                      }`}
                    >
                      {done ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-medium text-center leading-tight ${
                        active
                          ? "text-foreground"
                          : done
                            ? "text-success-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {children}
        </div>
      </QuestionnaireProvider>
    </AuthGate>
  );
}
