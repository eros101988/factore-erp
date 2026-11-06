import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Calculator, History, Upload, LogOut } from "lucide-react";
import { isSupabaseConfigured } from "@/repositories";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "侑安 ERP - S1.5",
  description: "Pricing Engine and Quote System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDemoMode = process.env.NODE_ENV !== 'production' && !isSupabaseConfigured();

  return (
    <html lang="zh-TW">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative">
          {isDemoMode && (
            <div className="bg-amber-500 text-white text-xs font-bold text-center py-1 sticky top-0 z-50">
              DEMO MODE — DATA WILL NOT PERSIST
            </div>
          )}
          <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-blue-600">侑安 ERP</h1>
            <nav className="flex space-x-4">
              <Link href="/" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                <Calculator size={20} />
                <span className="text-[10px] mt-1">報價</span>
              </Link>
              <Link href="/history" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                <History size={20} />
                <span className="text-[10px] mt-1">紀錄</span>
              </Link>
              <Link href="/import" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                <Upload size={20} />
                <span className="text-[10px] mt-1">匯入</span>
              </Link>
              <form action="/auth/logout" method="POST">
                <button type="submit" className="text-gray-600 hover:text-red-600 flex flex-col items-center cursor-pointer bg-transparent border-none">
                  <LogOut size={20} />
                  <span className="text-[10px] mt-1">登出</span>
                </button>
              </form>
            </nav>
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
