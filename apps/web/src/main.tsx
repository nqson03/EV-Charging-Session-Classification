import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createBrowserRouter, RouterProvider } from "react-router";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";
import { AppShell } from "./layout/AppShell";
import { store } from "./lib/store";
import { ChargerFaultsPage } from "./pages/ChargerFaults";
import { DataPage } from "./pages/Data";
import { FirmwarePage } from "./pages/Firmware";
import { NotFoundPage } from "./pages/NotFound";
import { OverviewPage } from "./pages/Overview";
import { RulesPage } from "./pages/Rules";
import { StationsPage } from "./pages/Stations";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/charger-faults", element: <ChargerFaultsPage /> },
      { path: "/firmware", element: <FirmwarePage /> },
      { path: "/stations", element: <StationsPage /> },
      { path: "/data", element: <DataPage /> },
      { path: "/rules", element: <RulesPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </Provider>
  </StrictMode>,
);
