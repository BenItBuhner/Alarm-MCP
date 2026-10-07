import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-mono",
});

export const metadata: Metadata = {
  title: "Alarm MCP",
  description: "Sign in. The device is ready. An agent rings it. You answer.",
};

const clerkAppearance = {
  variables: {
    colorPrimary: "#e8a13a",
    colorBackground: "#101218",
    colorText: "#f3efe6",
    colorTextSecondary: "#8b90a0",
    colorInputBackground: "#07080b",
    colorInputText: "#f3efe6",
    colorNeutral: "#8b90a0",
    borderRadius: "10px",
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: "bg-panel shadow-none border border-line",
    headerTitle: "text-paper",
    socialButtonsBlockButton: "border-line",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="describedby" href="/llms.txt" />
        <link rel="alternate" type="text/markdown" href="/index.md" />
      </head>
      <body className={`${sans.variable} ${mono.variable} font-sans text-paper antialiased`}>
        <ClerkProvider appearance={clerkAppearance}>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
