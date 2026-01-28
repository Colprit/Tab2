import './globals.css'

export const metadata = {
  title: 'Google Sheets AI Assistant',
  description: 'AI Assistant Sidebar for Google Sheets',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
