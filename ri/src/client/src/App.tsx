import { Switch, Route, Redirect } from "wouter";
import { MobileShell } from "./components/layout/mobile-shell.js";
import { DesktopShell } from "./components/layout/desktop-shell.js";
import { Toaster } from "./components/ui/toaster.js";
import { ProtectedRoute } from "./lib/protected-route.js";
import { ScootProvider } from "./hooks/use-scoot.js";
import { LayoutModeProvider, useLayoutMode } from "./hooks/use-layout-mode.js";
import AuthPage from "./pages/auth-page.js";
import ChatPage from "./pages/chat-page.js";
import MailPage from "./pages/mail-page.js";
import WalletPage from "./pages/wallet-page.js";
import BotPage from "./pages/bot-page.js";
import SmsLogPage from "./pages/sms-log-page.js";
import OversightPage from "./pages/oversight-page.js";
import StakingPage from "./pages/staking-page.js";
import ScootPage from "./pages/scoot-page.js";
import PrivacyPage from "./pages/privacy-page.js";
import TermsPage from "./pages/terms-page.js";
import NotFound from "./pages/not-found.js";

const routes = (
  <Switch>
    <Route path="/" component={() => <Redirect to="/chat" />} />
    <Route path="/auth" component={AuthPage} />
    <Route path="/privacy" component={PrivacyPage} />
    <Route path="/terms" component={TermsPage} />
    <Route path="/chat">
      <ProtectedRoute><ChatPage /></ProtectedRoute>
    </Route>
    <Route path="/mail">
      <ProtectedRoute><MailPage /></ProtectedRoute>
    </Route>
    <Route path="/wallet">
      <ProtectedRoute><WalletPage /></ProtectedRoute>
    </Route>
    <Route path="/bot">
      <ProtectedRoute><BotPage /></ProtectedRoute>
    </Route>
    <Route path="/sms-log">
      <ProtectedRoute><SmsLogPage /></ProtectedRoute>
    </Route>
    <Route path="/oversight">
      <ProtectedRoute><OversightPage /></ProtectedRoute>
    </Route>
    <Route path="/staking">
      <ProtectedRoute><StakingPage /></ProtectedRoute>
    </Route>
    <Route path="/page/:slug">
      <ProtectedRoute><ScootPage /></ProtectedRoute>
    </Route>
    <Route component={NotFound} />
  </Switch>
);

function Shell() {
  const { mode } = useLayoutMode();
  return mode === "desktop" ? <DesktopShell>{routes}</DesktopShell> : <MobileShell>{routes}</MobileShell>;
}

export default function App() {
  return (
    <ScootProvider>
      <LayoutModeProvider>
        <div className="min-h-screen bg-black text-white">
          <Shell />
          <Toaster />
        </div>
      </LayoutModeProvider>
    </ScootProvider>
  );
}
