import { Redirect } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../hooks/use-auth.js";
import { loginSchema, type LoginInput } from "@shared/schema.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";

// Public landing copy — only logged-out visitors reach this page.
// Update WEEKLY_STATUS each week (e.g. "No play Tuesday — court closed for the holiday").
const WEEKLY_STATUS = "Normal play / hours this week.";

export default function AuthPage() {
  const { user, login, loginError } = useAuth();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (user) return <Redirect to="/chat" />;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-8 p-6">
      <header className="flex flex-col items-center text-center max-w-md">
        <img
          src="/assets/white_on_transparent_scoot.png"
          alt="Scoot"
          className="h-14 w-auto mb-4"
        />
        <h1 className="text-3xl font-bold tracking-tight text-white">The Dream Laboratory</h1>
        <p className="mt-1 text-lg text-white/80">Home of the Fonde Brotherhood</p>
        <p className="mt-3 text-sm font-medium text-white/70">Men's Senior Basketball · 55+</p>
        <p className="mt-2 text-sm text-white/70">
          We play 4-on-4 pickup at Fonde Rec Center on Tuesdays at 4pm and Saturdays at 10am.
        </p>
        <p className="mt-4 text-sm text-white/70">
          <span className="text-white/50">Status:</span> {WEEKLY_STATUS}
        </p>
      </header>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center pb-4">
          <CardTitle className="text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => login(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="your_username" autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {loginError && (
                <p className="text-sm text-destructive">{loginError.message}</p>
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="text-sm text-white/70">
        Text <a href="sms:+13614232253" className="text-white underline underline-offset-2">361-423-2253</a> for latest updates
      </p>
    </div>
  );
}
