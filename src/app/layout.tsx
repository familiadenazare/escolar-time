import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Tipografia do Manual de Marca do CAFN (a mesma da Catequese e da Preceptoria):
// Inter no texto, Playfair Display nos títulos.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Pedagógico · Família de Nazaré",
    template: "%s · Pedagógico",
  },
  description: "Horários e verificação de diários do Colégio Arquidiocesano Família de Nazaré",
};

export const viewport: Viewport = {
  themeColor: "#212F5C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
