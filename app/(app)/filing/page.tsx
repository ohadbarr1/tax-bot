import type { Metadata } from "next";
export const metadata: Metadata = { title: "הגשה" };
export default function FilingPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <div className="text-5xl">📄</div>
      <h1 className="text-2xl font-bold text-foreground">מערכת ההגשה</h1>
      <p className="text-muted-foreground">שלב ההגשה האוטומטית יהיה זמין בקרוב. לעת עתה, הורידו את הטופס מלוח הבקרה והגישו ידנית לאתר רשות המיסים.</p>
    </div>
  );
}
