import { Switch, Route, Redirect } from "wouter";
import { Header } from "./components/layout/header.js";
import { Toaster } from "./components/ui/toaster.js";
import { ProtectedRoute } from "./lib/protected-route.js";
import AuthPage from "./pages/auth-page.js";
import ChatPage from "./pages/chat-page.js";
import WalletPage from "./pages/wallet-page.js";
import BotPage from "./pages/bot-page.js";
import NotFound from "./pages/not-found.js";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-14">
        <Switch>
          <Route path="/" component={() => <Redirect to="/chat" />} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/chat">
            <ProtectedRoute><ChatPage /></ProtectedRoute>
          </Route>
          <Route path="/wallet">
            <ProtectedRoute><WalletPage /></ProtectedRoute>
          </Route>
          <Route path="/bot">
            <ProtectedRoute><BotPage /></ProtectedRoute>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <Toaster />
    </div>
  );
}
