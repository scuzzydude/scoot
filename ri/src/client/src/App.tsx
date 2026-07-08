import { Switch, Route, Redirect } from "wouter";
import { Header } from "./components/layout/header.js";
import { BottomNav } from "./components/layout/bottom-nav.js";
import { Toaster } from "./components/ui/toaster.js";
import { ProtectedRoute } from "./lib/protected-route.js";
import { useAuth } from "./hooks/use-auth.js";
import { ScootProvider } from "./hooks/use-scoot.js";
import AuthPage from "./pages/auth-page.js";
import ChatPage from "./pages/chat-page.js";
import WalletPage from "./pages/wallet-page.js";
import BotPage from "./pages/bot-page.js";
import SmsLogPage from "./pages/sms-log-page.js";
import OversightPage from "./pages/oversight-page.js";
import ScootPage from "./pages/scoot-page.js";
import PrivacyPage from "./pages/privacy-page.js";
import TermsPage from "./pages/terms-page.js";
import NotFound from "./pages/not-found.js";

export default function App() {
  const { user } = useAuth();

  return (
    <ScootProvider>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-[640px] min-h-screen md:border-x md:border-white/5 relative">
          <Header />
          <main className={`pt-14 ${user ? "pb-16" : ""}`}>
            <Switch>
              <Route path="/" component={() => <Redirect to="/chat" />} />
              <Route path="/auth" component={AuthPage} />
              <Route path="/privacy" component={PrivacyPage} />
              <Route path="/terms" component={TermsPage} />
              <Route path="/chat">
                <ProtectedRoute><ChatPage /></ProtectedRoute>
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
              <Route path="/page/:slug">
                <ProtectedRoute><ScootPage /></ProtectedRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
          {user && <BottomNav />}
        </div>
        <Toaster />
      </div>
    </ScootProvider>
  );
}
