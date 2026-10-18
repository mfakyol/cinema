import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import { sessionStore } from "@/lib/session";
import { Root } from "./root";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } });
void sessionStore.restore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <Root />
        <Toaster position="top-center" />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
