import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Calculator, History, Upload, LogOut, DollarSign, Settings } from "lucide-react";
import { isSupabaseConfigured } from "@/repositories";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "侑安 ERP",
  description: "Pricing Engine and Quote System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDemoMode = process.env.NODE_ENV !== 'production' && !isSupabaseConfigured();
  
  let userRole = 'anon';
  let isAuthenticated = false;
  let isActive = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        isAuthenticated = true;
        
        try {
          const { data: profile } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).single();
          if (profile) {
            userRole = profile.role;
            isActive = profile.is_active;
          }
        } catch (profileError) {
          console.error("Error fetching user profile:", profileError);
          
          // Test environment bypass for E2E tests since Playwright can't easily seed the Supabase Auth system 
          // AND trigger the triggers that create user_profiles automatically in the test environment setup yet.
          if (process.env.NODE_ENV === 'test' && process.env.E2E_TEST_MODE === 'true') {
            console.log("E2E TEST MODE: Granting admin access for testing missing profile");
            userRole = 'admin';
            isActive = true;
          } else {
            if (process.env.E2E_TEST_MODE === 'true' && process.env.NODE_ENV !== 'test') {
               console.warn("SECURITY WARNING: E2E_TEST_MODE is true but NODE_ENV is not 'test'. Bypass disabled.");
            }
            // Fail Closed: If profile cannot be fetched in production, we do not grant any roles.
            userRole = 'anon';
            isActive = false;
          }
        }
        
        // Fail Closed: If the user is not active, they should not have access to ERP features.
        // We can handle the redirect in middleware or client, but for layout we just downgrade their role.
        if (!isActive) {
           userRole = 'anon';
        }
      }
    } catch (e) {
      // Auth check failed or not configured fully
      console.error("Auth check error in layout:", e);
      userRole = 'anon';
      isActive = false;
    }
  }

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
            {isAuthenticated && (
              <nav className="flex space-x-4">
                {(userRole === "admin" || userRole === "staff" || userRole === "anon") && (
                  <Link href="/" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                    <Calculator size={20} />
                    <span className="text-[10px] mt-1">報價</span>
                  </Link>
                )}
                {(userRole === "admin" || userRole === "staff") && (
                  <Link href="/history" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                    <History size={20} />
                    <span className="text-[10px] mt-1">紀錄</span>
                  </Link>
                )}
                {userRole === "admin" && (
                  <>
                    <Link href="/import" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                      <Upload size={20} />
                      <span className="text-[10px] mt-1">匯入</span>
                    </Link>
                    <Link href="/costs" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                      <DollarSign size={20} />
                      <span className="text-[10px] mt-1">成本</span>
                    </Link>
                    <Link href="/settings/pricing-policy" className="text-gray-600 hover:text-blue-600 flex flex-col items-center">
                      <Settings size={20} />
                      <span className="text-[10px] mt-1">政策</span>
                    </Link>
                  </>
                )}
                <form action="/auth/logout" method="POST">
                  <button type="submit" className="text-gray-600 hover:text-red-600 flex flex-col items-center cursor-pointer bg-transparent border-none">
                    <LogOut size={20} />
                    <span className="text-[10px] mt-1">登出</span>
                  </button>
                </form>
              </nav>
            )}
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
