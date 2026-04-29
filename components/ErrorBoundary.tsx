"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches uncaught render errors in its subtree.
 *
 * Phase 0 / 0.F: forwards every caught error to Sentry (initialised in
 * `instrumentation-client.ts`). The previous SENTRY_HOOK comment is now
 * the real call. If Sentry's DSN is unset (local dev / CI) the SDK is a
 * no-op, so this stays safe in every environment.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info);
    // Phase 0 / 0.F — forward to Sentry. `extra: info` carries the
    // React component stack so the Sentry issue includes the render path.
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center bg-background p-8"
        >
          <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-[#0B3B5C]">
              משהו השתבש
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              אירעה שגיאה בלתי צפויה. הדף יכול להיטען מחדש כדי לנסות שוב.
            </p>
            {this.state.error && (
              <details className="text-left text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                <summary className="cursor-pointer font-mono">
                  {this.state.error.message}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px]">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-5 py-2 bg-[#0B3B5C] text-white text-sm font-medium rounded-xl hover:bg-[#0F5A8A] transition-colors"
            >
              טען מחדש
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
