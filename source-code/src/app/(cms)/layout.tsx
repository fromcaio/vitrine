import TopBar from "@/components/layout/TopBar";

export default function CMSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1">
        {children}
      </main>
      {/* Você pode adicionar um Footer aqui futuramente */}
    </div>
  );
}