import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alarm MCP",
  description: "Sign up, pair a device, give an agent this site. It rings you; Approve/Deny comes back.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="describedby" href="/llms.txt" />
        <link rel="alternate" type="text/markdown" href="/index.md" />
      </head>
      <body className="font-sans text-zinc-100 antialiased">
        <ClerkProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
