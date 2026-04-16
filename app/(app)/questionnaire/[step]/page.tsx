"use client";

import { use } from "react";
import { useRouter, redirect } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuestionnaire } from "@/lib/questionnaireContext";
import {
  isValidSlug,
  nextSlug,
  prevSlug,
  STEP_CONFIG,
  getStepBySlug,
  LAST_STEP_ID,
} from "@/lib/questionnaireSteps";
import Step0Personal from "@/components/questionnaire/Step0Personal";
import Step1Personal from "@/components/questionnaire/Step1Personal";
import Step2Education from "@/components/questionnaire/Step2Education";
import Step3Capital from "@/components/questionnaire/Step3Capital";
import Step4Employers from "@/components/questionnaire/Step4Employers";
import Step5Deductions from "@/components/questionnaire/Step5Deductions";
import Step6LifeEvents from "@/components/questionnaire/Step6LifeEvents";
import Step7CreditPoints from "@/components/questionnaire/Step7CreditPoints";

export default function StepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step: slug } = use(params);
  const router = useRouter();
  const ctx = useQuestionnaire();

  if (!isValidSlug(slug)) {
    redirect("/questionnaire/personal");
  }

  const currentStep = getStepBySlug(slug)!;
  const prev = prevSlug(slug);
  const next = nextSlug(slug);
  const isLast = currentStep.id === LAST_STEP_ID;

  // ── Step component adapter ─────────────────────────────────────────────────

  function renderStep() {
    switch (slug) {
      case "personal":
        return (
          <Step0Personal
            firstName={ctx.firstName}
            lastName={ctx.lastName}
            idNumber={ctx.idNumber}
            address={ctx.address}
            bank={ctx.bank}
            onFirstNameChange={ctx.setFirstName}
            onLastNameChange={ctx.setLastName}
            onIdNumberChange={ctx.setIdNumber}
            onAddressChange={ctx.setAddress}
            onBankChange={ctx.setBank}
          />
        );
      case "family":
        return (
          <Step1Personal
            maritalStatus={ctx.maritalStatus}
            spouseIncome={ctx.spouseIncome}
            paysAlimony={ctx.paysAlimony}
            children={ctx.children}
            onMaritalStatusChange={ctx.setMaritalStatus}
            onSpouseIncomeChange={ctx.setSpouseIncome}
            onPaysAlimonyChange={ctx.setPaysAlimony}
            onChildrenChange={ctx.setChildren}
          />
        );
      case "education":
        return (
          <Step2Education
            hasDegree={ctx.hasDegree}
            degrees={ctx.degrees}
            onHasDegreeChange={ctx.setHasDegree}
            onDegreesChange={ctx.setDegrees}
          />
        );
      case "capital":
        return (
          <Step3Capital
            investsCapital={ctx.investsCapital}
            portfolioLocation={ctx.portfolioLocation}
            selectedBroker={ctx.selectedBroker}
            onInvestsCapitalChange={ctx.setInvestsCapital}
            onPortfolioLocationChange={ctx.setPortfolioLocation}
            onSelectedBrokerChange={ctx.setSelectedBroker}
          />
        );
      case "employers":
        return (
          <Step4Employers
            employers={ctx.employers}
            hasOverlap={ctx.hasOverlap}
            onAddEmployer={ctx.addEmployer}
            onRemoveEmployer={ctx.removeEmployer}
            onUpdateEmployer={ctx.updateEmployer}
          />
        );
      case "deductions":
        return (
          <Step5Deductions
            deductions={ctx.deductions}
            donationCredit={ctx.donationCredit}
            lifeInsCredit={ctx.lifeInsCredit}
            onAddDeduction={ctx.addDeduction}
            onRemoveDeduction={ctx.removeDeduction}
            onUpdateDeduction={ctx.updateDeduction}
          />
        );
      case "life-events":
        return (
          <Step6LifeEvents
            lifeEvents={ctx.lifeEvents}
            maritalStatus={ctx.maritalStatus}
            childrenCount={ctx.children.length}
            hasDegree={ctx.hasDegree}
            degreesCount={ctx.degrees.length}
            investsCapital={ctx.investsCapital}
            portfolioLocation={ctx.portfolioLocation}
            selectedBroker={ctx.selectedBroker}
            employersCount={ctx.employers.length}
            hasOverlap={ctx.hasOverlap}
            deductionsCount={ctx.deductions.length}
            onUpdateLifeEvent={ctx.updateLifeEvent}
          />
        );
      case "credit-points":
        return (
          <Step7CreditPoints
            gender={ctx.gender}
            servedInArmy={ctx.servedInArmy}
            dischargeYear={ctx.dischargeYear}
            isOleh={ctx.isOleh}
            aliyahDate={ctx.aliyahDate}
            postcode={ctx.postcode}
            kibbutzMember={ctx.kibbutzMember}
            hasDisability={ctx.hasDisability}
            disabilityType={ctx.disabilityType}
            disabilityPercent={ctx.disabilityPercent}
            children={ctx.children}
            onGenderChange={ctx.setGender}
            onServedInArmyChange={ctx.setServedInArmy}
            onDischargeYearChange={ctx.setDischargeYear}
            onIsOlehChange={ctx.setIsOleh}
            onAliyahDateChange={ctx.setAliyahDate}
            onPostcodeChange={ctx.setPostcode}
            onKibbutzMemberChange={ctx.setKibbutzMember}
            onHasDisabilityChange={ctx.setHasDisability}
            onDisabilityTypeChange={ctx.setDisabilityType}
            onDisabilityPercentChange={ctx.setDisabilityPercent}
            onChildrenChange={ctx.setChildren}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="p-8 space-y-6">{renderStep()}</div>

      {/* ── Footer navigation ── */}
      <div className="px-8 pb-7 flex justify-between items-center border-t border-border pt-5">
        <button
          onClick={() => prev && router.push(`/questionnaire/${prev}`)}
          disabled={!prev}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
          חזרה
        </button>

        <span className="text-xs text-slate-400">
          {currentStep.id} / {STEP_CONFIG.length}
        </span>

        {!isLast ? (
          <button
            onClick={() => next && router.push(`/questionnaire/${next}`)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-slate-800 transition-all"
          >
            המשך
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={ctx.handleFinish}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200"
          >
            <Check className="w-4 h-4" />
            סיים ועבור לדוח
          </button>
        )}
      </div>
    </div>
  );
}
