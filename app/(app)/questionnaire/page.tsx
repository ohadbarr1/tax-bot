"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { Questionnaire } from "@/components/Questionnaire";

export default function QuestionnairePage() {
  const { state } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (state.questionnaire.completed) {
      router.push("/dashboard");
    }
  }, [state.questionnaire.completed, router]);

  return <Questionnaire />;
}
