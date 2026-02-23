import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout, type Page } from "@/layouts/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { ApiKeysPage } from "@/pages/ApiKeysPage";
import { EventsPage } from "@/pages/EventsPage";
import { PlaygroundPage } from "@/pages/PlaygroundPage";

function AppContent() {
  const { username } = useAuth();
  const [page, setPage] = useState<Page>("overview");

  if (!username) {
    return <LoginPage />;
  }

  return (
    <AppLayout page={page} onNavigate={setPage}>
      {page === "overview" && <OverviewPage />}
      {page === "keys" && <ApiKeysPage />}
      {page === "events" && <EventsPage />}
      {page === "playground" && <PlaygroundPage />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
