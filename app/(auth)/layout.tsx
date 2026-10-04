export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="agent"
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12"
    >
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
