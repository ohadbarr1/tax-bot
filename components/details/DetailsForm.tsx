"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, User, MapPin, Landmark, Briefcase, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { Field } from "./Field";
import type { Employer } from "@/types";
import { cn } from "@/lib/utils";

/**
 * DetailsForm — /details
 *
 * Editable prefill page shown right after the onboarding mining pass.
 * Sections: identity, address, bank, employers. Uses Field wrapper for
 * every input so provenance pills + confidence tiers render inline.
 *
 * Save button:
 *   - commits any pending edits (already written on every keystroke via
 *     updateTaxpayer, so this is a no-op for data)
 *   - marks onboarding.detailsConfirmed = true
 *   - navigates to /dashboard
 *
 * There is no separate "finish" button — the form IS the input surface.
 * The dashboard is the next-step target.
 */
export function DetailsForm() {
  const router = useRouter();
  const { state, updateTaxpayer, markDetailsConfirmed } = useApp();
  const { taxpayer } = state;
  const [saving, setSaving] = useState(false);

  const updateEmployer = (idx: number, patch: Partial<Employer>) => {
    const next = [...(taxpayer.employers ?? [])];
    next[idx] = { ...next[idx], ...patch };
    updateTaxpayer({ employers: next });
  };

  const addEmployer = () => {
    const next: Employer[] = [
      ...(taxpayer.employers ?? []),
      {
        id: `employer-${Date.now()}`,
        name: "",
        isMainEmployer: (taxpayer.employers ?? []).length === 0,
        monthsWorked: 12,
      },
    ];
    updateTaxpayer({ employers: next });
  };

  const removeEmployer = (idx: number) => {
    const next = [...(taxpayer.employers ?? [])];
    next.splice(idx, 1);
    updateTaxpayer({ employers: next });
  };

  const handleSave = async () => {
    setSaving(true);
    markDetailsConfirmed();
    // let React flush then navigate
    await Promise.resolve();
    router.push("/dashboard");
  };

  return (
    <div dir="rtl">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">פרטים אישיים</h1>
        <p className="text-sm text-muted-foreground mt-1">
          מילאתי מה שהצלחתי לקרוא מהמסמכים. בדקו, תקנו אם צריך, ושנמשיך.
        </p>
      </motion.header>

      <div className="space-y-6">
        <Section icon={<User className="w-4 h-4" />} title="זהות">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              path="taxpayer.firstName"
              label="שם פרטי"
              value={taxpayer.firstName}
              onChange={(v) => updateTaxpayer({ firstName: v })}
            />
            <Field
              path="taxpayer.lastName"
              label="שם משפחה"
              value={taxpayer.lastName}
              onChange={(v) => updateTaxpayer({ lastName: v })}
            />
            <Field
              path="taxpayer.idNumber"
              label="תעודת זהות"
              value={taxpayer.idNumber}
              onChange={(v) => updateTaxpayer({ idNumber: v })}
              type="tel"
              dir="ltr"
            />
            <Field
              path="taxpayer.profession"
              label="מקצוע / עיסוק"
              value={taxpayer.profession}
              onChange={(v) => updateTaxpayer({ profession: v })}
            />
          </div>
        </Section>

        <Section icon={<MapPin className="w-4 h-4" />} title="כתובת">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field
              path="taxpayer.address.city"
              label="עיר"
              value={taxpayer.address?.city}
              onChange={(v) =>
                updateTaxpayer({
                  address: {
                    city: v,
                    street: taxpayer.address?.street ?? "",
                    houseNumber: taxpayer.address?.houseNumber ?? "",
                  },
                })
              }
              className="sm:col-span-1"
            />
            <Field
              path="taxpayer.address.street"
              label="רחוב"
              value={taxpayer.address?.street}
              onChange={(v) =>
                updateTaxpayer({
                  address: {
                    city: taxpayer.address?.city ?? "",
                    street: v,
                    houseNumber: taxpayer.address?.houseNumber ?? "",
                  },
                })
              }
              className="sm:col-span-1"
            />
            <Field
              path="taxpayer.address.houseNumber"
              label="מספר בית"
              value={taxpayer.address?.houseNumber}
              onChange={(v) =>
                updateTaxpayer({
                  address: {
                    city: taxpayer.address?.city ?? "",
                    street: taxpayer.address?.street ?? "",
                    houseNumber: v,
                  },
                })
              }
              className="sm:col-span-1"
            />
          </div>
        </Section>

        <Section icon={<Landmark className="w-4 h-4" />} title="פרטי בנק (להחזר)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              path="taxpayer.bank.bankName"
              label="שם הבנק"
              value={taxpayer.bank?.bankName}
              onChange={(v) =>
                updateTaxpayer({
                  bank: {
                    bankId: taxpayer.bank?.bankId ?? "",
                    bankName: v,
                    branch: taxpayer.bank?.branch ?? "",
                    account: taxpayer.bank?.account ?? "",
                  },
                })
              }
            />
            <Field
              path="taxpayer.bank.branch"
              label="סניף"
              value={taxpayer.bank?.branch}
              onChange={(v) =>
                updateTaxpayer({
                  bank: {
                    bankId: taxpayer.bank?.bankId ?? "",
                    bankName: taxpayer.bank?.bankName ?? "",
                    branch: v,
                    account: taxpayer.bank?.account ?? "",
                  },
                })
              }
              type="tel"
              dir="ltr"
            />
            <Field
              path="taxpayer.bank.account"
              label="מספר חשבון"
              value={taxpayer.bank?.account}
              onChange={(v) =>
                updateTaxpayer({
                  bank: {
                    bankId: taxpayer.bank?.bankId ?? "",
                    bankName: taxpayer.bank?.bankName ?? "",
                    branch: taxpayer.bank?.branch ?? "",
                    account: v,
                  },
                })
              }
              type="tel"
              dir="ltr"
              className="sm:col-span-2"
            />
          </div>
        </Section>

        <Section
          icon={<Briefcase className="w-4 h-4" />}
          title="מעסיקים"
          action={
            <button
              type="button"
              onClick={addEmployer}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
            >
              <Plus className="w-3.5 h-3.5" /> הוסף מעסיק
            </button>
          }
        >
          {(taxpayer.employers ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">אין מעסיקים עדיין. העלו טופס 106 או הוסיפו ידנית.</p>
          ) : (
            <div className="space-y-4">
              {(taxpayer.employers ?? []).map((emp, idx) => (
                <div key={emp.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">
                      מעסיק {idx + 1} {emp.isMainEmployer && "(עיקרי)"}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeEmployer(idx)}
                      className="text-muted-foreground hover:text-red-600"
                      aria-label="הסר מעסיק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                      path={`taxpayer.employers[${idx}].name`}
                      label="שם המעסיק"
                      value={emp.name}
                      onChange={(v) => updateEmployer(idx, { name: v })}
                    />
                    <Field
                      path={`taxpayer.employers[${idx}].monthsWorked`}
                      label="חודשי עבודה"
                      value={emp.monthsWorked}
                      onChange={(v) => updateEmployer(idx, { monthsWorked: Number(v) || 0 })}
                      type="number"
                    />
                    <Field
                      path={`taxpayer.employers[${idx}].grossSalary`}
                      label="ברוטו שנתי (₪)"
                      value={emp.grossSalary}
                      onChange={(v) => updateEmployer(idx, { grossSalary: Number(v) || 0 })}
                      type="number"
                    />
                    <Field
                      path={`taxpayer.employers[${idx}].taxWithheld`}
                      label="מס שנוכה (₪)"
                      value={emp.taxWithheld}
                      onChange={(v) => updateEmployer(idx, { taxWithheld: Number(v) || 0 })}
                      type="number"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={() => router.push("/welcome")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl border border-border"
        >
          <ArrowLeft className="w-4 h-4" /> חזרה
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex-1 bg-amber-500 text-stone-950 font-bold py-3 rounded-xl hover:opacity-90 transition-opacity",
            saving && "opacity-60"
          )}
        >
          {saving ? "שומר..." : "שמור והמשך ללוח הבקרה ←"}
        </button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
