"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  LayoutGrid,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Landing / mock sign-in. This is a visual gateway only — there is no real
// authentication (the challenge explicitly excludes an auth system). Any
// credentials continue into the demo account.

const FEATURES = [
  { icon: CreditCard, title: "Pay & promise", text: "Make mocked payments or set a promise to pay." },
  { icon: CalendarClock, title: "Book a call", text: "Schedule a callback with an agent in seconds." },
  { icon: ShieldCheck, title: "Secure by design", text: "Sensitive detail is sent only in an encrypted PDF." },
];

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    router.push("/portal");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef5fb_0%,#dcecf3_52%,#d8f0ec_100%)] p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1400px] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/45 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-sm lg:min-h-[calc(100vh-3rem)] lg:grid-cols-2">
        {/* Brand / marketing panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0f1d3d_0%,#15294f_55%,#22407a_100%)] p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-28 -left-16 size-80 rounded-full bg-[#3b82f6]/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
              <LayoutGrid className="size-6" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Account Portal</span>
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5" /> AI-powered self-service
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Manage your account by simply chatting.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-white/70">
              Read and update your details, make payments, set promises to pay,
              and book calls — all in plain language.
            </p>

            <div className="mt-9 space-y-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <f.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-sm text-white/60">{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-xs text-white/40">
            Demo environment · Example Energy Ireland
          </p>
        </div>

        {/* Sign-in panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-slate-300/70 bg-white/80 text-slate-700 shadow-sm">
                <LayoutGrid className="size-5" />
              </div>
              <span className="text-lg font-semibold">Account Portal</span>
            </div>

            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Sign in to your account to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    defaultValue="jane.murphy@example.test"
                    placeholder="you@example.com"
                    className="h-12 pl-10"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input type="password" defaultValue="demo-access" className="h-12 pl-10" />
                </div>
              </label>

              <Button
                type="submit"
                disabled={loading}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-medium text-white transition",
                  "bg-[linear-gradient(135deg,#0f1d3d,#2b4c8c)] hover:opacity-95",
                )}
              >
                {loading ? "Signing in…" : "Sign in"}
                {!loading && <ArrowRight className="size-4" />}
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-center text-xs text-slate-500">
              Demo access — no real authentication. Any credentials continue as
              <span className="font-medium text-slate-700"> Jane Murphy</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
