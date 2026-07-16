import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import heroImage from "../assets/digital-twin-hero.png";

const steps = [
  { eyebrow: "Live visibility", title: "See the whole building", description: "Explore floors, rooms and employee seats through one living digital twin.", items: ["Live floor status", "Employee seat health", "Room availability"], icon: "◇" },
  { eyebrow: "Fast response", title: "Turn issues into action", description: "Move from a reported problem to an owned, trackable resolution in moments.", items: ["Priority complaint queue", "Clear ownership", "Complete history"], icon: "↗" },
  { eyebrow: "Connected teams", title: "Keep everyone informed", description: "Send targeted messages and announcements directly into each workspace.", items: ["Instant notifications", "Admin messaging", "Visible resolutions"], icon: "✦" }
];

const hotspots = [
  { left: "39%", top: "27%" },
  { left: "67%", top: "43%" },
  { left: "52%", top: "63%" }
];

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.29.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.38 3.13 1.05 4.49l3.34-2.62Z"/><path fill="#EA4335" d="M12 6c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z"/></svg>;
}

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [step, setStep] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const active = steps[step];

  const startSignIn = async () => {
    setSigningIn(true);
    setError("");
    try { await signInWithGoogle(); }
    catch { setSigningIn(false); setError("Sign-in could not start. Please try again."); }
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#050918] text-white">
      <main className="grid h-full grid-rows-[39%_61%] lg:grid-cols-[1.16fr_.84fr] lg:grid-rows-1">
        <section className="relative min-h-0 overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 scale-[1.02] bg-cover bg-center transition-transform duration-700 lg:bg-[position:48%_center]" style={{ backgroundImage: `url(${heroImage})` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050918]/45 via-transparent to-[#050918]/80 lg:bg-gradient-to-r lg:from-[#050918]/30 lg:via-transparent lg:to-[#050918]/35" />
          <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:64px_64px]" />

          <div className="absolute left-4 top-4 z-10 flex items-center gap-2.5 sm:left-7 sm:top-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/35"><span className="grid grid-cols-2 gap-1"><i className="h-1.5 w-1.5 rounded-sm bg-white"/><i className="h-1.5 w-1.5 rounded-sm bg-white/70"/><i className="h-1.5 w-1.5 rounded-sm bg-white/70"/><i className="h-1.5 w-1.5 rounded-sm bg-white"/></span></span>
            <div><p className="text-sm font-extrabold">Digital Twin</p><p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-300">Operations</p></div>
          </div>

          {hotspots.map((point, index) => <button key={index} onClick={() => setStep(index)} aria-label={`View ${steps[index].title}`} className={`absolute z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition-all duration-300 ${step === index ? "scale-110 border-white/70 bg-indigo-500 shadow-[0_0_0_8px_rgba(99,102,241,.18),0_0_28px_rgba(99,102,241,.9)]" : "border-white/50 bg-slate-950/55 hover:scale-110 hover:bg-indigo-500"}`} style={point}><span className="h-1.5 w-1.5 rounded-full bg-white"/></button>)}

          <div className="absolute bottom-4 left-4 right-4 z-10 hidden items-end justify-between gap-4 sm:flex sm:bottom-6 sm:left-7 sm:right-7">
            <div className="max-w-xl"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-slate-950/55 px-3 py-1 text-[9px] font-black uppercase tracking-[.17em] text-emerald-300 backdrop-blur"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"/> Live digital twin</div><h1 className="text-3xl font-black leading-none tracking-[-.045em] lg:text-5xl">Your building,<br/><span className="bg-gradient-to-r from-indigo-200 to-cyan-300 bg-clip-text text-transparent">alive with context.</span></h1></div>
            <div className="hidden rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 text-right backdrop-blur-xl xl:block"><p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-400">Selected experience</p><p className="mt-1 text-sm font-extrabold">{active.title}</p></div>
          </div>
        </section>

        <section className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,.17),transparent_38%),#080e20] px-4 py-3 sm:px-7 lg:px-9">
          <button onClick={() => setStep(steps.length - 1)} className="absolute right-4 top-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-slate-400 transition hover:bg-white/10 hover:text-white lg:right-7 lg:top-6">Skip to sign in</button>

          <div className="w-full max-w-[520px] rounded-[26px] border border-white/10 bg-white/[.065] p-1.5 shadow-[0_28px_90px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <div className="rounded-[21px] border border-white/[.07] bg-[#0d162b]/95 p-4 sm:p-5 lg:p-7">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">{steps.map((_, index) => <button key={index} onClick={() => setStep(index)} aria-label={`Step ${index + 1}`} className={`h-1.5 rounded-full transition-all ${step === index ? "w-8 bg-gradient-to-r from-indigo-400 to-cyan-300" : "w-4 bg-white/15 hover:bg-white/30"}`}/>)}</div>
                <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-600">{step + 1} / {steps.length}</span>
              </div>

              <div key={step} className="login-step-enter">
                <div className="mt-4 flex items-start gap-3 lg:mt-6"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg shadow-lg shadow-indigo-950/50">{active.icon}</span><div><p className="text-[9px] font-black uppercase tracking-[.19em] text-indigo-300">{active.eyebrow}</p><h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl lg:text-3xl">{active.title}</h2></div></div>
                <p className="mt-3 text-xs leading-5 text-slate-400 sm:text-sm sm:leading-6">{active.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">{active.items.map((item) => <div key={item} className="rounded-xl border border-white/[.07] bg-white/[.035] px-2 py-2.5 text-center"><span className="mx-auto mb-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-[10px] text-emerald-300">✓</span><p className="text-[9px] font-bold leading-3.5 text-slate-300 sm:text-[10px]">{item}</p></div>)}</div>
              </div>

              {error && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
              <div className="mt-4 flex gap-2.5 lg:mt-5">
                {step > 0 && <button onClick={() => setStep((value) => value - 1)} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-extrabold text-slate-300 hover:bg-white/5">Back</button>}
                {step < steps.length - 1 ? <button onClick={() => setStep((value) => value + 1)} className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-xs font-extrabold shadow-lg shadow-indigo-950/40 transition hover:-translate-y-0.5">Continue →</button> : <button disabled={signingIn} onClick={startSignIn} className="flex min-h-11 flex-1 items-center justify-center gap-2.5 rounded-xl bg-white px-5 text-xs font-extrabold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-100 disabled:opacity-70"><GoogleIcon/>{signingIn ? "Opening sign-in…" : "Continue with Google"}</button>}
              </div>
              <p className="mt-3 text-center text-[9px] text-slate-600">Secure access for authorised administrators.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
