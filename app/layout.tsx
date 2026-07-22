import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enterprise Process & Knowledge Map",
  description: "Mapa empresarial de procesos, conocimiento y control documental.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="/app.css?v=20260722-1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
