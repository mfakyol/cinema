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

// A box office, not a web page: no browser menu on right click or long press, except in fields.
window.addEventListener("contextmenu", (event) => {
  if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault();
  }
});

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
