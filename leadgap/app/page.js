'use client';

import Link from "next/link";

const steps = [
  {
    title: "Targeted Market Data Extraction",
    description:
      "Intelligent agents scan local reviews to identify exactly where competitors are failing to meet customer needs and expectations",
  },
  {
    title: "Autonomous Intelligence Processing",
    description:
      "The system transforms messy customer feedback into organized reports that clearly show you how to beat your local competition",
  },
  {
    title: "Data-Driven Content Creation",
    description:
      "Quickly generate professional advertisements that specifically target competitor mistakes to attract frustrated customers directly to your own business",
  },
];

const features = [
  {
    title: "Deep Data Dive",
    description:
      "Transforming raw customer reviews into your most valuable market intelligence, driving smarter business decisions",
  },
  {
    title: "Opportunity Scout",
    description:
      "Identifying where competitors fall short, revealing your next strategic advantage and untapped market opportunities",
  },
  {
    title: "Campaign Ready Copy",
    description:
      "Generate compelling ad copy, perfectly tailored to identified market opportunities, ready for immediate deployment",
  },
];

export default function Main() {
  const handleNavClick = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="home" className="bg-[#010409] flex flex-col">

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <div className="relative min-h-screen w-full flex flex-col overflow-hidden">

      <img
        src="/hero.png"
        className="absolute top-0 left-0 pointer-events-none select-none"
        style={{ width: "100vw", height: "100vh", display: "block" }}
        aria-hidden="true"
      />

        {/* Navbar */}
        <nav className="relative z-10 flex items-center justify-between px-8 py-6 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#1a1a1a] border border-white/10 flex items-center justify-center">
              <span className="text-white text-sm font-semibold" style={{ letterSpacing: "-0.06em" }}>
                LG
              </span>
            </div>
            <span className="text-white text-2xl font-semibold" style={{ letterSpacing: "-0.06em" }}>
              LeadGap
            </span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8">
            {["Home", "Services", "Plans"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-white hover:text-white/70 text-lg transition-colors duration-200"
                style={{ fontWeight: 500, letterSpacing: "-0.035em" }}
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-5 py-2 rounded-full bg-white text-[#010409] text-sm font-medium hover:bg-white/90 transition-colors duration-200 cursor-pointer"
              style={{ letterSpacing: "-0.035em" }}
            >
              Get Started
            </button>
            <button
              className="px-5 py-2 rounded-full text-white text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                letterSpacing: "-0.035em",
                background: "rgba(247, 247, 247, 0.09)",
                backdropFilter: "blur(12px) brightness(1.08)",
                WebkitBackdropFilter: "blur(12px) brightness(1.08)",
                border: "1px solid rgba(247, 247, 247, 0.12)",
                boxShadow: "inset 1px 1px 0px rgba(255,255,255,0.10), inset -1px -1px 0px rgba(0,0,0,0.08)",
              }}
            >
              Find a Gap
            </button>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pb-10 mt-15">
          <div
            className="mb-4 px-5 py-1.5 rounded-full text-white/85 text-md"
            style={{
              letterSpacing: "-0.035em",
              fontWeight: 400,
              background: "rgba(247, 247, 247, 0)",
              backdropFilter: "blur(12px) brightness(1.08)",
              WebkitBackdropFilter: "blur(12px) brightness(1.08)",
              border: "1px solid rgb(255, 255, 255)",
              boxShadow: "inset 1px 1px 0px rgba(255,255,255,0.08), inset -1px -1px 0px rgba(0,0,0,0.06)",
            }}
          >
            Smarter data, uncover market gaps.
          </div>

          <h1
            className="text-white mb-6 max-w-[780px]"
            style={{ fontSize: "72px", fontWeight: 600, letterSpacing: "-0.06em", lineHeight: "107%" }}
          >
            Stop Searching.
            <br />
            Start Closing
          </h1>

          <p
            className="text-white text-lg max-w-[580px] mb-10"
            style={{ fontWeight: 400, letterSpacing: "-0.035em", lineHeight: "137%" }}
          >
            Unlock your strategic advantage. LeadGap&apos;s AI uncovers market
            gaps and competitor weaknesses, delivering the intelligence you need
            to out maneuver rivals and close more deals
          </p>

          <div className="flex items-center gap-4">
            <Link
              href="/webapp"
              className="px-7 py-2 rounded-full bg-white text-[#010409] text-md font-medium hover:bg-white/90 transition-colors duration-200 cursor-pointer"
              style={{ letterSpacing: "-0.035em" }}
            >
              Try for free
            </Link>
            <button
              className="px-7 py-2 rounded-full text-white text-md font-medium transition-all duration-200 cursor-pointer"
              style={{
                letterSpacing: "-0.035em",
                background: "rgba(247, 247, 247, 0.09)",
                backdropFilter: "blur(12px) brightness(1.08)",
                WebkitBackdropFilter: "blur(12px) brightness(1.08)",
                border: "1px solid rgba(247, 247, 247, 0.58)",
                boxShadow: "inset 1px 1px 0px rgba(255,255,255,0.10), inset -1px -1px 0px rgba(0,0,0,0.08)",
              }}
            >
              How it works
            </button>
          </div>

          <div className="mt-8">
            <img src="/app-preview.png" alt="LeadGap App Preview" width={992} height={600} />
          </div>
        </div>
      </div>
      {/* ─── END HERO ─────────────────────────────────────────────────────── */}


      {/* ─── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="features" className="bg-[#010409] px-8 py-10">
        <div className="mx-auto max-w-[1250px]" style={{ border: "1px solid #1F1F1F" }}>
          <div className="px-8 py-8" style={{ borderBottom: "1px solid #1F1F1F" }}>
            <h2 className="text-white" style={{ fontSize: "39px", fontWeight: 600, letterSpacing: "-0.055em", lineHeight: "107%" }}>
              Your Strategic Toolkit
            </h2>
          </div>
          <div className="grid grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="px-8 py-10 flex flex-col gap-4"
                style={{ borderRight: index < features.length - 1 ? "1px solid #1F1F1F" : "none" }}
              >
                <h3 className="text-white" style={{ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.055em", lineHeight: "107%" }}>
                  {feature.title}
                </h3>
                <p className="text-white/40" style={{ fontSize: "17px", fontWeight: 400, letterSpacing: "-0.025em", lineHeight: "137%" }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ─── END FEATURES ─────────────────────────────────────────────────── */}


      {/* ─── PROCESS ──────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-[#010409] px-8 py-16">
        <div className="mx-auto max-w-[1250px]">

          {/* Section header */}
          <div className="flex flex-col gap-4 mb-12">
            <h2 className="text-white" style={{ fontSize: "39px", fontWeight: 600, letterSpacing: "-0.055em", lineHeight: "107%" }}>
              The LeadGap Process: From Data to Advantage
            </h2>
            <p className="text-white/40 max-w-[560px]" style={{ fontSize: "17px", fontWeight: 400, letterSpacing: "-0.025em", lineHeight: "137%" }}>
              See the seamless journey from raw market feedback to a powerful
              competitive edge, powered by LeadGap&apos;s intelligent agents.
            </p>
          </div>

          {/* Two column layout — equal halves, boxes centered to video */}
          <div className="grid grid-cols-[5fr_3fr] gap-8 items-center">

            {/* Left — video player, constrained height */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ width: "600px", height: "750px", maxHeight: "750px" }}>
              <video className="w-full h-full object-cover" autoPlay muted loop playsInline>
                <source src="/process-demo.mp4" type="video/mp4" />
              </video>
            </div>

            {/* Right — steps with connector PNG behind */}
            <div className="relative flex flex-col gap-10">
              {/* Connector line PNG */}
              <img
                src="/Spine.png"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none translate-y-2 origin-top scale-y-[1.005]"
                aria-hidden="true"
              />

              {steps.map((step) => (
                <div
                  key={step.title}
                  
                  className="relative z-10 flex flex-col justify-center items-start text-left gap-4 px-7 py-7"
                  style={{
                    background: "#010409",
                    border: "1px solid #0D3372",
                    borderRadius: "21px",
                    width: "580px",
                    height: "150px",
                    textAlign: "left"
                  }}
                >
                  <h3
                    className="text-white"
                    style={{
                      fontSize: "24px",
                      fontWeight: 600,
                      letterSpacing: "-0.055em",
                      lineHeight: "107%",
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 400,
                      letterSpacing: "-0.025em",
                      lineHeight: "130%",
                      color: "rgba(255, 255, 255, 0.85)",
                    }}
                  >
                    {step.description}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>
      {/* ─── END PROCESS ──────────────────────────────────────────────────── */}

      <footer id="about" className="relative overflow-hidden bg-[#010409] pt-12 pb-24 px-6 w-screen text-white text-sm">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start gap-10 lg:gap-24">
            
            {/* Left Side: Image + Text */}
            <div className="flex flex-col gap-2 max-w-sm">
              <img src="/BlackLogo.png" alt="LeadGap" className="w-28 h-auto mb-2 cursor-pointer" />
              <h3 className="text-base w-[520px] font-medium tracking-tight leading-6 text-white/85">
              LeadGap is an AI-powered market intelligence engine for local businesses and sales teams — enter a niche or competitor and get surgical vulnerability reports, market gap analysis, and precision ad copy, so you can outplay your rivals and close more deals without doing hours of manual research.
              </h3>
              <h2 className="text-xl tracking-tight w-max font-medium mt-1">
                Intelligent Insights. Grow everywhere. Powered by one — You + LeadGap
              </h2>
              <h2 className="text-sm w-max font-medium tracking-tight text-white/80 mt-3">
                Hey there 👋 I’m Rao, the maker of LeadGap. Feel free to check out my work over on Twitter
              </h2>
            </div>

            {/* Right Side: Two Columns */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full max-w-2xl">
              {/* Column 1 */}
              <div>
                <h1 className="text-base font-medium mb-2">Links</h1>
                <ul className="space-y-1">
                  <li><button onClick={() => handleNavClick('home')} className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">Home</button></li>
                  <li><button onClick={() => handleNavClick('features')} className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">Features</button></li>
                  <li><button onClick={() => handleNavClick('how-it-works')} className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">How it Works</button></li>
                  <li><button onClick={() => handleNavClick('about')} className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">About Us</button></li>
                </ul>
              </div>

              {/* Column 2 */}
              <div>
                <h1 className="text-base font-medium mb-2">More</h1>
                <ul className="space-y-1">
                  <li><a href="https://twitter.com/getrepliq" target="_blank" rel="noopener noreferrer" className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">Follow on Twitter</a></li>
                  <li><a href="https://instagram.com/getrepliq" target="_blank" rel="noopener noreferrer" className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">Follow on Instagram</a></li>
                  <li><a href="https://twitter.com/heyspecterr" target="_blank" rel="noopener noreferrer" className="text-white/70 font-medium hover:text-white transition-colors cursor-pointer">Creator</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Decorative footer mark (clipped) */}
          <img
            src="/repliq-logo.png"
            aria-hidden="true"
            className="pointer-events-none select-none absolute right-[180px] bottom-[-70px] w-[252px] opacity-60"
          />
        </footer>

    </div>
  );
}