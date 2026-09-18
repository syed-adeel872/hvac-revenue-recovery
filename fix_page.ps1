$content = @'
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">HVAC Revenue Recovery</h1>
        <p className="text-gray-600 mb-6 text-center">AI-powered follow-up message generator</p>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="font-semibold text-blue-900 mb-2">API Endpoint</h2>
            <p className="text-blue-800 text-sm">
              POST <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">/api/generate-message</code>
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h2 className="font-semibold text-green-900 mb-2">Example Request</h2>
            <pre className="bg-green-100 p-3 rounded text-xs overflow-x-auto text-green-800">{`\n  "customerName": "John Smith",\n  "hvacIssue": "AC unit not cooling",\n  "estimateAmount": 8500\n`}</pre>
          </div>
        </div>
      </div>
    </main>
  )
}
'@

Set-Content -Path "C:\Users\03111257119 M Niaz\Desktop\Business_Work\hvac-revenue-recovery\src\app\page.tsx" -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"