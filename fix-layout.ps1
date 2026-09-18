$content = @"
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HVAC Revenue Recovery',
  description: 'AI-powered revenue recovery for HVAC contractors',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        <body className="min-h-screen bg-gray-950 text-white antialiased">
          <div id="root">{children}</div>
        </body>
      </html>
    </html>
  );
}

export const metadata = {
  title: 'HVAC Revenue Recovery',
  description: 'AI-powered revenue recovery for HVAC contractors',
}
"@

Set-Content -Path "C:\Users\03111257119 M Niaz\Desktop\Business_Work\hvac-revenue-recovery\src\app\layout.tsx" -Value $content -Encoding UTF8