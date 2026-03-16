export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-3 sm:px-4">
      <div className="w-full max-w-sm sm:max-w-md">{children}</div>
    </div>
  );
}
