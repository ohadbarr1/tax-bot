"use client";
import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";

export default function DraftSwitchPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = use(params);
  const { state, switchDraft } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (state.drafts[draftId]) {
      switchDraft(draftId);
    }
    router.replace("/dashboard");
  }, [draftId, state.drafts, switchDraft, router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
