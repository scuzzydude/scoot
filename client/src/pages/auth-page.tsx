import { useState } from "react";
import { Redirect } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../hooks/use-auth.js";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@shared/schema.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";

function LoginForm() {
  const { login, loginError } = useAuth();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    await login(data);
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
              <FormControl><Input placeholder="your_username" autoComplete="username" {...field} /></FormControl>
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
              <FormControl><Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {loginError && <p className="text-sm text-destructive">{loginError.message}</p>}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Form>
  );
}

function RegisterForm() {
  const { register, registerError } = useAuth();
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterInput) {
    await register(data);
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
              <FormControl><Input placeholder="your_username" autoComplete="username" {...field} /></FormControl>
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
              <FormControl><Input type="email" placeholder="you@example.com" autoComplete="email" {...field} /></FormControl>
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
              <FormControl><Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {registerError && <p className="text-sm text-destructive">{registerError.message}</p>}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}

export default function AuthPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<string>("login");

  if (user) return <Redirect to="/chat" />;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Left panel — gradient split screen */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-primary to-primary/50 p-12">
        <div className="text-center space-y-4">
          <img src="/assets/white_on_transparent_scoot.png" alt="Scoot" className="h-16 mx-auto invert" />
          <p className="text-black/70 text-lg max-w-xs">
            Chat. Transact. Connect.
          </p>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">
              {tab === "login" ? "Welcome back" : "Create your account"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full mb-6">
                <TabsTrigger value="login" className="flex-1">Sign in</TabsTrigger>
                <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><LoginForm /></TabsContent>
              <TabsContent value="register"><RegisterForm /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
