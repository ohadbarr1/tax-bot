"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { employersOverlap } from "@/lib/utils";
import type { Child, Degree, Employer, PersonalDeduction, LifeEvent } from "@/types";
import { slideVariants, STEPS } from "./StepShell";
import Step0Personal from "./Step0Personal";
import Step1Personal from "./Step1Personal";
import Step2Education from "./Step2Education";
import Step3Capital from "./Step3Capital";
import Step4Employers from "./Step4Employers";
import Step5Deductions from "./Step5Deductions";
import Step6LifeEvents from "./Step6LifeEvents";

export function Questionnaire() {
  const router = useRouter();
  const {
    state,
    setQuestionnaireStep,
    completeQuestionnaire,
    updateTaxpayer,
    updateFinancials,
  } = useApp();
  const { taxpayer, financials } = state;

  const [step, setStep] = useState(state.questionnaire.step);
  const [dir,  setDir]  = useState(1);

  // ── Step 0 state (personal details) ────────────────────────────────────────
  const [firstName,  setFirstName]  = useState(taxpayer.firstName  ?? "");
  const [lastName,   setLastName]   = useState(taxpayer.lastName   ?? "");
  const [idNumber,   setIdNumber]   = useState(taxpayer.idNumber   ?? "");
  const [address,    setAddress]    = useState(taxpayer.address    ?? { city: "", street: "", houseNumber: "" });
  const [bank,       setBank]       = useState(taxpayer.bank       ?? { bankId: "", bankName: "", branch: "", account: "" });

  // ── Step 1 state ───────────────────────────────────────────────────────────
  const [maritalStatus, setMaritalStatus] = useState(taxpayer.maritalStatus);
  const [spouseIncome,  setSpouseIncome]  = useState(taxpayer.spouseHasIncome ?? false);
  const [paysAlimony,   setPaysAlimony]   = useState(taxpayer.paysAlimony ?? false);
  const [children,      setChildren]      = useState<Child[]>(taxpayer.children);

  // ── Step 2 state ───────────────────────────────────────────────────────────
  const [hasDegree, setHasDegree] = useState(taxpayer.degrees.length > 0);
  const [degrees,   setDegrees]   = useState<Degree[]>(taxpayer.degrees);

  // ── Step 3 state ───────────────────────────────────────────────────────────
  // Default `investsCapital` ONLY to true when we already know the user has a
  // foreign broker; otherwise leave it untouched so they can answer "no"
  // without the app pre-picking "bank" for them.
  const [investsCapital,   setInvestsCapital]   = useState(financials.hasForeignBroker);
  // `portfolioLocation` starts as null so the radio group shows no initial
  // selection — the old default of "bank" was a silent answer we never asked.
  const [portfolioLocation, setPortfolioLocation] = useState<
    "bank" | "local_broker" | "foreign_broker" | null
  >(financials.hasForeignBroker ? "foreign_broker" : null);
  const [selectedBroker, setSelectedBroker] = useState(financials.brokerName ?? "");

  // ── Step 4 state ──────────────────────────────────────────────────────────
  const [employers, setEmployers] = useState<Employer[]>(
    taxpayer.employers.length > 0
      ? taxpayer.employers
      : [{ id: "emp-main", name: "", isMainEmployer: true, monthsWorked: 12 }]
  );

  const addEmployer = () =>
    setEmployers((prev) => [
      ...prev,
      {
        id: `emp-${Date.now()}`,
        name: "",
        isMainEmployer: false,
        monthsWorked: 1,
        startMonth: 1,
        endMonth: 1,
        grossSalary: undefined,
        taxWithheld: undefined,
        pensionDeduction: undefined,
      },
    ]);

  const removeEmployer = (id: string) =>
    setEmployers((prev) => prev.filter((e) => e.id !== id));

  const updateEmployer = (id: string, patch: Partial<Employer>) =>
    setEmployers((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );

  const hasOverlap = employersOverlap(employers);

  // ── Step 5 state ──────────────────────────────────────────────────────────
  const [deductions, setDeductions] = useState<PersonalDeduction[]>(
    taxpayer.personalDeductions
  );

  const addDeduction = (type: PersonalDeduction["type"]) =>
    setDeductions((prev) => [
      ...prev,
      { id: `ded-${Date.now()}`, type, amount: 0, providerName: "" },
    ]);

  const removeDeduction = (id: string) =>
    setDeductions((prev) => prev.filter((d) => d.id !== id));

  const updateDeduction = (id: string, patch: Partial<PersonalDeduction>) =>
    setDeductions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );

  const donationCredit = Math.round(
    deductions
      .filter((d) => d.type === "donation_sec46")
      .reduce((s, d) => s + d.amount, 0) * 0.35
  );
  const lifeInsCredit = Math.round(
    deductions
      .filter((d) => d.type === "life_insurance_sec45a")
      .reduce((s, d) => s + d.amount, 0) * 0.25
  );

  // ── Step 6 state ──────────────────────────────────────────────────────────
  const [lifeEvents, setLifeEvents] = useState<LifeEvent>(
    taxpayer.lifeEvents ?? {
      changedJobs: false,
      pulledSeverancePay: false,
      hasForm161: false,
    }
  );

  const updateLifeEvent = (patch: Partial<LifeEvent>) =>
    setLifeEvents((prev) => ({ ...prev, ...patch }));

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigate = (newStep: number) => {
    setDir(newStep > step ? 1 : -1);
    setStep(newStep);
    setQuestionnaireStep(newStep);
  };

  const handleFinish = () => {
    updateTaxpayer({
      firstName,
      lastName,
      idNumber,
      address,
      bank,
      maritalStatus,
      spouseHasIncome: spouseIncome,
      paysAlimony,
      children,
      degrees,
      employers,
      personalDeductions: deductions,
      lifeEvents,
    });
    updateFinancials({
      hasForeignBroker: portfolioLocation === "foreign_broker",
      brokerName:
        portfolioLocation === "foreign_broker" ? selectedBroker : undefined,
      employersCount: employers.length,
    });
    completeQuestionnaire();
    // App Router doesn't react to `state.currentView` — must push explicitly.
    router.push("/documents");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

      {/* ── Step indicator ── */}
      <div className="mb-10">
        <div className="relative flex items-start justify-between">
          <div className="absolute top-5 start-[4%] end-[4%] h-0.5 bg-border -z-0" />
          {STEPS.map((s) => {
            const Icon = s.icon;
            const done   = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5 z-10 w-[14.28%]">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    done
                      ? "bg-[#0F172A] dark:bg-brand-700 border-[#0F172A] dark:border-brand-700 text-white"
                      : active
                      ? "bg-background border-[#0F172A] dark:border-brand-700 text-foreground shadow-md"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span
                  className={`text-[10px] font-medium text-center leading-tight ${
                    active ? "text-foreground" : done ? "text-success-500" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Card ──
          AnimatePresence without `mode="wait"`: old step exits in parallel
          with new step entering, so content lands at the same instant the
          stepper indicator updates. With mode="wait" the 280ms exit stalls
          the new step, leaving the indicator visibly ahead of the content. */}
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <AnimatePresence custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="p-8 space-y-6"
          >
            {step === 1 && (
              <Step0Personal
                firstName={firstName}
                lastName={lastName}
                idNumber={idNumber}
                address={address}
                bank={bank}
                onFirstNameChange={setFirstName}
                onLastNameChange={setLastName}
                onIdNumberChange={setIdNumber}
                onAddressChange={setAddress}
                onBankChange={setBank}
              />
            )}

            {step === 2 && (
              <Step1Personal
                maritalStatus={maritalStatus}
                spouseIncome={spouseIncome}
                paysAlimony={paysAlimony}
                children={children}
                onMaritalStatusChange={setMaritalStatus}
                onSpouseIncomeChange={setSpouseIncome}
                onPaysAlimonyChange={setPaysAlimony}
                onChildrenChange={setChildren}
              />
            )}

            {step === 3 && (
              <Step2Education
                hasDegree={hasDegree}
                degrees={degrees}
                onHasDegreeChange={setHasDegree}
                onDegreesChange={setDegrees}
              />
            )}

            {step === 4 && (
              <Step3Capital
                investsCapital={investsCapital}
                portfolioLocation={portfolioLocation}
                selectedBroker={selectedBroker}
                onInvestsCapitalChange={setInvestsCapital}
                onPortfolioLocationChange={setPortfolioLocation}
                onSelectedBrokerChange={setSelectedBroker}
              />
            )}

            {step === 5 && (
              <Step4Employers
                employers={employers}
                hasOverlap={hasOverlap}
                onAddEmployer={addEmployer}
                onRemoveEmployer={removeEmployer}
                onUpdateEmployer={updateEmployer}
              />
            )}

            {step === 6 && (
              <Step5Deductions
                deductions={deductions}
                donationCredit={donationCredit}
                lifeInsCredit={lifeInsCredit}
                onAddDeduction={addDeduction}
                onRemoveDeduction={removeDeduction}
                onUpdateDeduction={updateDeduction}
              />
            )}

            {step === 7 && (
              <Step6LifeEvents
                lifeEvents={lifeEvents}
                maritalStatus={maritalStatus}
                childrenCount={children.length}
                hasDegree={hasDegree}
                degreesCount={degrees.length}
                investsCapital={investsCapital}
                portfolioLocation={portfolioLocation}
                selectedBroker={selectedBroker}
                employersCount={employers.length}
                hasOverlap={hasOverlap}
                deductionsCount={deductions.length}
                onUpdateLifeEvent={updateLifeEvent}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Footer navigation ── */}
        <div className="px-8 pb-7 flex justify-between items-center border-t border-border pt-5">
          <button
            onClick={() => navigate(step - 1)}
            disabled={step === 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
            חזרה
          </button>

          <span className="text-xs text-slate-400">
            {step} / {STEPS.length}
          </span>

          {step < STEPS.length ? (
            <button
              onClick={() => navigate(step + 1)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-slate-800 transition-all"
            >
              המשך
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200"
            >
              <Check className="w-4 h-4" />
              סיים ועבור לדוח
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Questionnaire;
