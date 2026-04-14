"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Render fixed-size placeholder until mounted to avoid SSR/client mismatch
  if (!mounted) {
    return <div className="w-8 h-8" aria-hidden="true" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-8 h-8 rounded-xl flex items-center justify-center text-foreground bg-transparent hover:bg-primary/10 transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-accent-500" />
      ) : (
        <Moon className="w-4 h-4 text-brand-900" />
      )}
    </button>
  );
}
