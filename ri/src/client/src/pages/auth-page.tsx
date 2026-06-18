import { useState } from "react";
import { Redirect } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../hooks/use-auth.js";
import {
  loginRequestSchema, loginVerifySchema, registerSchema,
  type LoginRequestInput, type LoginVerifyInput, type RegisterInput,
} from "@shared/schema.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";

const WEEKLY_STATUS = "Normal play / hours this week.";

// ─── Sign-in (2-step OTP) ────────────────────────────────────────────────────

function SignInForm() {
  const { loginRequest, loginVerify, loginVerifyError } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);

  const phoneForm = useForm<LoginRequestInput>({ resolver: zodResolver(loginRequestSchema) });
  const codeForm = useForm<LoginVerifyInput>({ resolver: zodResolver(loginVerifySchema) });

  async function onPhoneSubmit(data: LoginRequestInput) {
    setRequestError(null);
    try {
      await loginRequest(data);
      setPhone(data.phone);
      setStep("code");
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Failed to send code");
    }
  }

  async function onCodeSubmit(data: LoginVerifyInput) {
    await loginVerify({ phone, code: data.code });
  }

  if (step === "phone") {
    return (
      <Form {...phoneForm}>
        <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
          <FormField
            control={phoneForm.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone number</FormLabel>
                <FormControl>
                  <Input placeholder="7135550100" autoComplete="tel-national" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {requestError && <p className="text-sm text-destructive">{requestError}</p>}
          <Button type="submit" className="w-full" disabled={phoneForm.formState.isSubmitting}>
            {phoneForm.formState.isSubmitting ? "Sending…" : "Send code"}
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...codeForm}>
      <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
        <p className="text-sm text-white/70">
          Code sent to <span className="text-white">{phone}</span>.
        </p>
        <FormField
          control={codeForm.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>5-digit code</FormLabel>
              <FormControl>
                <Input
                  placeholder="12345"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {loginVerifyError && (
          <p className="text-sm text-destructive">{loginVerifyError.message}</p>
        )}
        <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>
          {codeForm.formState.isSubmitting ? "Verifying…" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => setStep("phone")}
          className="w-full text-sm text-white/50 hover:text-white/80"
        >
          ← Use a different number
        </button>
      </form>
    </Form>
  );
}

// ─── Register ────────────────────────────────────────────────────────────────

function RegisterForm() {
  const { register, registerError } = useAuth();
  const [done, setDone] = useState(false);
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterInput) {
    await register(data);
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-white font-medium">Account created!</p>
        <p className="text-sm text-white/70">
          You&apos;re registered but not yet staked. Switch to Sign in and log in with your phone number.
          Then ask Brandon to stake you in person.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="rocketman" autoComplete="username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="Brandon Awbrey" autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone (10 digits, US)</FormLabel>
              <FormControl>
                <Input placeholder="7135550100" autoComplete="tel-national" inputMode="numeric" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {registerError && (
          <p className="text-sm text-destructive">{registerError.message}</p>
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { user } = useAuth();
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
        <p className="mt-3 text-sm font-medium text-white/70">Men&apos;s Senior Basketball · 55+</p>
        <p className="mt-2 text-sm text-white/70">
          We play 4-on-4 pickup at Fonde Rec Center on Tuesdays at 4pm and Saturdays at 10am.
        </p>
        <p className="mt-4 text-sm text-white/70">
          <span className="text-white/50">Status:</span> {WEEKLY_STATUS}
        </p>
      </header>

      <Card className="w-full max-w-sm">
        <CardHeader className="items-center pb-2">
          <CardTitle className="text-xl">Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-sm text-white/70">
        Text <a href="sms:+13614232253" className="text-white underline underline-offset-2">361-423-2253</a> for latest updates
      </p>
      <p className="text-xs text-white/40 pb-4">
        <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>
        {" · "}
        <a href="/terms" className="underline underline-offset-2">Terms of Service</a>
      </p>
    </div>
  );
}
