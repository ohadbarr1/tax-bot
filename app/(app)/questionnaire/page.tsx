"use client";
import { Questionnaire } from "@/components/Questionnaire";
import { AuthGate } from "@/components/auth/AuthGate";

export default function QuestionnairePage() {
  return (
    <AuthGate>
      <Questionnaire />
    </AuthGate>
  );
}
