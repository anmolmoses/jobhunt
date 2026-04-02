import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "JobHunt - AI-Powered Job Search",
  description: "Self-hosted job hunting application with AI resume analysis and multi-provider job search",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <ToastProvider>
          <Sidebar />
          <main className="ml-64 min-h-screen">
            <div className="container max-w-6xl p-8">{children}</div>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
