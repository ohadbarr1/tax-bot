"use client";

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
    "w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]";

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">פרטים אישיים</h2>
        <p className="mt-1 text-sm text-slate-500">
          פרטים אלה ישמשו למילוי טופס 135 ולהגשה לרשות המיסים.
        </p>
      </div>

      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>שם פרטי</Label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            placeholder="לדוגמה: ישראל"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label>שם משפחה</Label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
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
        <p className="text-sm font-semibold text-[#0F172A]">כתובת מגורים</p>
        <div className="space-y-1.5">
          <Label>עיר</Label>
          <input
            type="text"
            value={address.city}
            onChange={(e) => onAddressChange({ ...address, city: e.target.value })}
            placeholder="לדוגמה: תל אביב"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>רחוב</Label>
            <input
              type="text"
              value={address.street}
              onChange={(e) => onAddressChange({ ...address, street: e.target.value })}
              placeholder="שם הרחוב"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label>מספר בית</Label>
            <input
              type="text"
              value={address.houseNumber}
              onChange={(e) => onAddressChange({ ...address, houseNumber: e.target.value })}
              placeholder="12"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0F172A]">פרטי חשבון בנק (להחזר)</p>
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
            <input
              type="text"
              value={bank.bankName}
              onChange={(e) => onBankChange({ ...bank, bankName: e.target.value })}
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
