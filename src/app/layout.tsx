import type { Metadata } from "next";
import "./globals.css";
import { AppNavigation } from "@/components/app-navigation";

export const metadata: Metadata = { title: "크리에이터 스카우트", description: "크리에이터 스카우팅 및 추천 운영 대시보드" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return <html lang="ko"><body><AppNavigation /><main className="min-h-screen px-4 py-7 sm:px-6 lg:ml-64 lg:px-10 lg:py-9"><div className="mx-auto max-w-[1440px]">{children}</div></main></body></html>;
}
