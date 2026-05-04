"use client";

import { useEffect, useRef, useState } from "react";
import { Label, InfoBox } from "./StepShell";
import { isValidTZ } from "@/lib/validateTZ";

interface BankState {
  bankId: string;
  bankName: string;
  branch: string;
  account: string;
}

interface AddressState {
  city: string;
  street: string;
  houseNumber: string;
}

interface Props {
  firstName: string;
  lastName: string;
  idNumber: string;
  address: AddressState;
  bank: BankState;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onIdNumberChange: (v: string) => void;
  onAddressChange: (v: AddressState) => void;
  onBankChange: (v: BankState) => void;
}

/**
 * T6: Hebrew IME keystrokes were getting dropped on address fields because
 * every keystroke rebuilt the entire `address` object (and thus the parent
 * context memo), which caused React to re-render with a new prop identity on
 * the `<input>` mid-composition. A Hebrew composition event that spans two
 * renders loses the in-flight partial character.
 *
 * Fix: <ComposableTextInput> holds a private useState per field, commits to
 * the parent on onChange for non-IME typing, and DEFERS parent propagation
 * until `compositionend` for IME composition. Focus stays on the native DOM
 * node across parent re-renders because the input's `value` prop is locally
 * owned, not driven by a remote object reference.
 */
function ComposableTextInput({
  value,
  onChange,
  placeholder,
  className,
  inputMode,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "numeric" | "decimal";
  maxLength?: number;
}) {
  const [local, setLocal] = useState(value);
  const composingRef = useRef(false);

  // Sync down when the parent pushes a new value AND we're not mid-composition.
  // Gating on composingRef prevents an IME half-committed state from being
  // stomped by a stale parent value.
  useEffect(() => {
    if (!composingRef.current) setLocal(value);
  }, [value]);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (!composingRef.current) onChange(e.target.value);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        const next = (e.target as HTMLInputElement).value;
        setLocal(next);
        onChange(next);
      }}
      placeholder={placeholder}
      className={className}
      inputMode={inputMode}
      maxLength={maxLength}
    />
  );
}

export default function Step0Personal({
  firstName,
  lastName,
  idNumber,
  address,
  bank,
  onFirstNameChange,
  onLastNameChange,
  onIdNumberChange,
  onAddressChange,
  onBankChange,
}: Props) {
  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-kc-ink/20 focus:border-kc-ink";

  // Local refs to the latest address so per-field setters don't go stale.
  const addressRef = useRef(address);
  useEffect(() => { addressRef.current = address; }, [address]);

  const setAddressField = (key: keyof AddressState) => (v: string) => {
    onAddressChange({ ...addressRef.current, [key]: v });
  };

  const bankRef = useRef(bank);
  useEffect(() => { bankRef.current = bank; }, [bank]);
  const setBankField = (key: keyof BankState) => (v: string) => {
    onBankChange({ ...bankRef.current, [key]: v });
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-kc-ink">פרטים אישיים</h2>
        <p className="mt-1 text-sm text-slate-500">
          פרטים אלה ישמשו למילוי טופס 135 ולהגשה לרשות המיסים.
        </p>
      </div>

      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>שם פרטי</Label>
          <ComposableTextInput
            value={firstName}
            onChange={onFirstNameChange}
            placeholder="לדוגמה: ישראל"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label>שם משפחה</Label>
          <ComposableTextInput
            value={lastName}
            onChange={onLastNameChange}
            placeholder="לדוגמה: ישראלי"
            className={inputClass}
          />
        </div>
      </div>

      {/* ID Number */}
      <div className="space-y-1.5">
        <Label>מספר תעודת זהות</Label>
        <input
          type="text"
          value={idNumber}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 9);
            onIdNumberChange(val);
          }}
          placeholder="9 ספרות"
          maxLength={9}
          inputMode="numeric"
          className={inputClass}
        />
        {idNumber.length > 0 && idNumber.length < 9 && (
          <p className="text-xs text-amber-600">תעודת זהות חייבת להכיל 9 ספרות</p>
        )}
        {idNumber.length === 9 && !isValidTZ(idNumber) && (
          <p className="text-xs text-rose-500 mt-1">מספר תעודת זהות לא תקין — ספרת ביקורת שגויה</p>
        )}
        {idNumber.length === 9 && isValidTZ(idNumber) && (
          <p className="text-xs text-emerald-600 mt-1">&#x2713;</p>
        )}
      </div>

      {/* Address */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-kc-ink">כתובת מגורים</p>
        <div className="space-y-1.5">
          <Label>עיר</Label>
          <ComposableTextInput
            value={address.city}
            onChange={setAddressField("city")}
            placeholder="לדוגמה: תל אביב"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>רחוב</Label>
            <ComposableTextInput
              value={address.street}
              onChange={setAddressField("street")}
              placeholder="שם הרחוב"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label>מספר בית</Label>
            <ComposableTextInput
              value={address.houseNumber}
              onChange={setAddressField("houseNumber")}
              placeholder="12"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-kc-ink">פרטי חשבון בנק (להחזר)</p>
          <span className="text-xs text-slate-400">אופציונלי</span>
        </div>
        <InfoBox>
          פרטי הבנק ישמשו להחזר המס ישירות לחשבונך. ניתן להשלים לאחר מכן.
        </InfoBox>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>מספר בנק</Label>
            <input
              type="text"
              value={bank.bankId}
              onChange={(e) => onBankChange({ ...bank, bankId: e.target.value.replace(/\D/g, "") })}
              placeholder='לדוגמה: 12 = הפועלים'
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label>שם הבנק</Label>
            <ComposableTextInput
              value={bank.bankName}
              onChange={setBankField("bankName")}
              placeholder="בנק הפועלים"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>מספר סניף</Label>
            <input
              type="text"
              value={bank.branch}
              onChange={(e) => onBankChange({ ...bank, branch: e.target.value.replace(/\D/g, "") })}
              placeholder="123"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label>מספר חשבון</Label>
            <input
              type="text"
              value={bank.account}
              onChange={(e) => onBankChange({ ...bank, account: e.target.value.replace(/\D/g, "") })}
              placeholder="12345678"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </>
  );
}
