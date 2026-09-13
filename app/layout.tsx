import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backstop — revenue retention agent",
  description:
    "An autonomous agent that investigates churn risk across Stripe, Linear, Slack, Notion and Resend, then executes a policy-gated, verified recovery play.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
