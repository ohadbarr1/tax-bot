"use client";
import { DetailsForm } from "@/components/details/DetailsForm";
import { AdvisorNudgeRail } from "@/components/details/AdvisorNudgeRail";

export default function DetailsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
      <DetailsForm />
      <div className="lg:sticky lg:top-20 h-fit">
        <AdvisorNudgeRail />
      </div>
    </div>
  );
}

