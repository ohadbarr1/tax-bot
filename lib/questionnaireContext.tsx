"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { employersOverlap } from "@/lib/utils";
import type {
  Child,
  Degree,
  Employer,
  PersonalDeduction,
  LifeEvent,
  DisabilityType,
  Address,
  BankDetails,
} from "@/types";

// ─── Context value shape ─────────────────────────────────────────────────────

interface QuestionnaireContextValue {
  // Step 0 — personal details
  firstName: string;
  lastName: string;
  idNumber: string;
  address: Address;
  bank: BankDetails;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setIdNumber: (v: string) => void;
  setAddress: (v: Address) => void;
  setBank: (v: BankDetails) => void;

  // Step 1 — family
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  spouseIncome: boolean;
  paysAlimony: boolean;
  children: Child[];
  setMaritalStatus: (v: "single" | "married" | "divorced" | "widowed") => void;
  setSpouseIncome: (v: boolean) => void;
  setPaysAlimony: (v: boolean) => void;
  setChildren: (v: Child[]) => void;

  // Step 2 — education
  hasDegree: boolean;
  degrees: Degree[];
  setHasDegree: (v: boolean) => void;
  setDegrees: (v: Degree[]) => void;

  // Step 3 — capital
  investsCapital: boolean;
  portfolioLocation: "bank" | "local_broker" | "foreign_broker" | null;
  selectedBroker: string;
  setInvestsCapital: (v: boolean) => void;
  setPortfolioLocation: (v: "bank" | "local_broker" | "foreign_broker" | null) => void;
  setSelectedBroker: (v: string) => void;

  // Step 4 — employers
  employers: Employer[];
  setEmployers: (v: Employer[]) => void;
  addEmployer: () => void;
  removeEmployer: (id: string) => void;
  updateEmployer: (id: string, patch: Partial<Employer>) => void;
  hasOverlap: boolean;

  // Step 5 — deductions
  deductions: PersonalDeduction[];
  addDeduction: (type: PersonalDeduction["type"]) => void;
  removeDeduction: (id: string) => void;
  updateDeduction: (id: string, patch: Partial<PersonalDeduction>) => void;
  donationCredit: number;
  lifeInsCredit: number;

  // Step 6 — life events
  lifeEvents: LifeEvent;
  updateLifeEvent: (patch: Partial<LifeEvent>) => void;

  // Step 7 — credit points
  gender: "male" | "female" | undefined;
  servedInArmy: boolean;
  dischargeYear: number | undefined;
  isOleh: boolean;
  aliyahDate: string;
  postcode: string;
  kibbutzMember: boolean;
  hasDisability: boolean;
  disabilityType: DisabilityType | undefined;
  disabilityPercent: number;
  setGender: (v: "male" | "female" | undefined) => void;
  setServedInArmy: (v: boolean) => void;
  setDischargeYear: (v: number | undefined) => void;
  setIsOleh: (v: boolean) => void;
  setAliyahDate: (v: string) => void;
  setPostcode: (v: string) => void;
  setKibbutzMember: (v: boolean) => void;
  setHasDisability: (v: boolean) => void;
  setDisabilityType: (v: DisabilityType | undefined) => void;
  setDisabilityPercent: (v: number) => void;

  // Finish
  handleFinish: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const QuestionnaireContext = createContext<QuestionnaireContextValue | null>(
  null,
);

// ─── Provider ────────────────────────────────────────────────────────────────

export function QuestionnaireProvider({
  children: providerChildren,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    state,
    completeQuestionnaire,
    updateTaxpayer,
    updateFinancials,
  } = useApp();
  const { taxpayer, financials } = state;

  // ── Step 0 ──────────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(taxpayer.firstName ?? "");
  const [lastName, setLastName] = useState(taxpayer.lastName ?? "");
  const [idNumber, setIdNumber] = useState(taxpayer.idNumber ?? "");
  const [address, setAddress] = useState<Address>(
    taxpayer.address ?? { city: "", street: "", houseNumber: "" },
  );
  const [bank, setBank] = useState<BankDetails>(
    taxpayer.bank ?? { bankId: "", bankName: "", branch: "", account: "" },
  );

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  const [maritalStatus, setMaritalStatus] = useState(taxpayer.maritalStatus);
  const [spouseIncome, setSpouseIncome] = useState(
    taxpayer.spouseHasIncome ?? false,
  );
  const [paysAlimony, setPaysAlimony] = useState(taxpayer.paysAlimony ?? false);
  const [children, setChildren] = useState<Child[]>(taxpayer.children);

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  const [hasDegree, setHasDegree] = useState(taxpayer.degrees.length > 0);
  const [degrees, setDegrees] = useState<Degree[]>(taxpayer.degrees);

  // ── Step 3 ──────────────────────────────────────────────────────────────────
  const [investsCapital, setInvestsCapital] = useState(
    financials.hasForeignBroker,
  );
  const [portfolioLocation, setPortfolioLocation] = useState<
    "bank" | "local_broker" | "foreign_broker" | null
  >(financials.hasForeignBroker ? "foreign_broker" : null);
  const [selectedBroker, setSelectedBroker] = useState(
    financials.brokerName ?? "",
  );

  // ── Step 4 ──────────────────────────────────────────────────────────────────
  const [employers, setEmployers] = useState<Employer[]>(
    taxpayer.employers.length > 0
      ? taxpayer.employers
      : [{ id: "emp-main", name: "", isMainEmployer: true, monthsWorked: 12 }],
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
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );

  const hasOverlap = employersOverlap(employers);

  // ── Step 5 ──────────────────────────────────────────────────────────────────
  const [deductions, setDeductions] = useState<PersonalDeduction[]>(
    taxpayer.personalDeductions,
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
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );

  const donationCredit = Math.round(
    deductions
      .filter((d) => d.type === "donation_sec46")
      .reduce((s, d) => s + d.amount, 0) * 0.35,
  );
  const lifeInsCredit = Math.round(
    deductions
      .filter((d) => d.type === "life_insurance_sec45a")
      .reduce((s, d) => s + d.amount, 0) * 0.25,
  );

  // ── Step 6 ──────────────────────────────────────────────────────────────────
  const [lifeEvents, setLifeEvents] = useState<LifeEvent>(
    taxpayer.lifeEvents ?? {
      changedJobs: false,
      pulledSeverancePay: false,
      hasForm161: false,
    },
  );

  const updateLifeEvent = (patch: Partial<LifeEvent>) =>
    setLifeEvents((prev) => ({ ...prev, ...patch }));

  // ── Step 7 ──────────────────────────────────────────────────────────────────
  const [gender, setGender] = useState<"male" | "female" | undefined>(
    taxpayer.gender,
  );
  const [servedInArmy, setServedInArmy] = useState(
    taxpayer.dischargeYear != null,
  );
  const [dischargeYear, setDischargeYear] = useState<number | undefined>(
    taxpayer.dischargeYear,
  );
  const [isOleh, setIsOleh] = useState(
    taxpayer.aliyahDate != null && taxpayer.aliyahDate !== "",
  );
  const [aliyahDate, setAliyahDate] = useState(taxpayer.aliyahDate ?? "");
  const [postcode, setPostcode] = useState(taxpayer.postcode ?? "");
  const [kibbutzMember, setKibbutzMember] = useState(
    taxpayer.kibbutzMember ?? false,
  );
  const [hasDisability, setHasDisability] = useState(
    taxpayer.disabilityType != null ||
      (taxpayer.disabilityPercent != null && taxpayer.disabilityPercent > 0),
  );
  const [disabilityType, setDisabilityType] = useState<
    DisabilityType | undefined
  >(taxpayer.disabilityType);
  const [disabilityPercent, setDisabilityPercent] = useState(
    taxpayer.disabilityPercent ?? 0,
  );

  // ── Finish ──────────────────────────────────────────────────────────────────

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
      gender,
      dischargeYear: servedInArmy ? dischargeYear : undefined,
      aliyahDate: isOleh ? aliyahDate : undefined,
      postcode: postcode || undefined,
      kibbutzMember,
      disabilityType: hasDisability ? disabilityType : undefined,
      disabilityPercent: hasDisability ? disabilityPercent : undefined,
    });
    updateFinancials({
      hasForeignBroker: portfolioLocation === "foreign_broker",
      brokerName:
        portfolioLocation === "foreign_broker" ? selectedBroker : undefined,
      employersCount: employers.length,
    });
    completeQuestionnaire();
    router.push("/documents");
  };

  // ── Memoised value ──────────────────────────────────────────────────────────

  const value = useMemo<QuestionnaireContextValue>(
    () => ({
      firstName,
      lastName,
      idNumber,
      address,
      bank,
      setFirstName,
      setLastName,
      setIdNumber,
      setAddress,
      setBank,
      maritalStatus,
      spouseIncome,
      paysAlimony,
      children,
      setMaritalStatus,
      setSpouseIncome,
      setPaysAlimony,
      setChildren,
      hasDegree,
      degrees,
      setHasDegree,
      setDegrees,
      investsCapital,
      portfolioLocation,
      selectedBroker,
      setInvestsCapital,
      setPortfolioLocation,
      setSelectedBroker,
      employers,
      setEmployers,
      addEmployer,
      removeEmployer,
      updateEmployer,
      hasOverlap,
      deductions,
      addDeduction,
      removeDeduction,
      updateDeduction,
      donationCredit,
      lifeInsCredit,
      lifeEvents,
      updateLifeEvent,
      gender,
      servedInArmy,
      dischargeYear,
      isOleh,
      aliyahDate,
      postcode,
      kibbutzMember,
      hasDisability,
      disabilityType,
      disabilityPercent,
      setGender,
      setServedInArmy,
      setDischargeYear,
      setIsOleh,
      setAliyahDate,
      setPostcode,
      setKibbutzMember,
      setHasDisability,
      setDisabilityType,
      setDisabilityPercent,
      handleFinish,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all state vars are stable setters or primitives
    [
      firstName,
      lastName,
      idNumber,
      address,
      bank,
      maritalStatus,
      spouseIncome,
      paysAlimony,
      children,
      hasDegree,
      degrees,
      investsCapital,
      portfolioLocation,
      selectedBroker,
      employers,
      hasOverlap,
      deductions,
      donationCredit,
      lifeInsCredit,
      lifeEvents,
      gender,
      servedInArmy,
      dischargeYear,
      isOleh,
      aliyahDate,
      postcode,
      kibbutzMember,
      hasDisability,
      disabilityType,
      disabilityPercent,
    ],
  );

  return (
    <QuestionnaireContext.Provider value={value}>
      {providerChildren}
    </QuestionnaireContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useQuestionnaire() {
  const ctx = useContext(QuestionnaireContext);
  if (!ctx)
    throw new Error(
      "useQuestionnaire must be used within QuestionnaireProvider",
    );
  return ctx;
}
