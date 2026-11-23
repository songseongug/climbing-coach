import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "클라이밍 코치",
  description:
    "클라이밍 기기·앱·데이터 분석 도구가 궁금한 클라이머와 코치를 위한 챗봇",
};

// 폰 화면에서 크기가 맞게 보이도록 한다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
