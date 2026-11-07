import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { CLIENTS, FAQ, STEPS, STORIES } from "./_landing/content";
import { DashboardMock } from "./_landing/DashboardMock";
import { HeroVideo, PinnedHero, RotatingName } from "./_landing/Hero";
import { Cube, Logo, Mark } from "./_landing/Logo";
import { Motion } from "./_landing/Motion";
import s from "./_landing/landing.module.css";

const display = Inter_Tight({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Usual · Now your agent can pay",
  description: "Credit lines your AI agent earns, a signature above them, and a key you can cut in one sentence. Enforced on Sui.",
};

export const viewport: Viewport = { themeColor: "#0b0c0b" };

export default function Landing() {
  return (
    <div className={`${s.root} ${display.variable}`}>
      <Motion />
      <a className={s.skip} href="#how">Skip to how it works</a>

      <header className={s.nav}>
        <Link href="/" className={s.brand}><Mark className={s.brandMark} />Usual</Link>
        <nav className={s.navLinks} aria-label="Sections">
          <a href="#stories">Use cases</a>
          <a href="#how">How it works</a>
          <a href="#faq">Questions</a>
        </nav>
        <Link href="/app" className={`${s.pill} ${s.pillWhite} ${s.pillSmall}`}>Open wallet</Link>
      </header>

      <main>
        {/* 1–2. Video hero, then the one pinned reveal into the dashboard. */}
        <PinnedHero>
          <div className={s.stage}>
            <HeroVideo />
            <div className={s.warm} aria-hidden="true" />
            <div className={s.grade} aria-hidden="true" />
            <div className={s.grain} aria-hidden="true" />
            <div className={s.veil} aria-hidden="true" />

            <div className={`${s.wrap} ${s.heroCopy}`}>
              <h1 className={s.heroTitle}>
                <span className={s.srOnly}>Now your AI agent can pay. Only what you allow.</span>
                <span aria-hidden="true">Now your <RotatingName /> can pay.</span>
                <span className={s.heroSub} aria-hidden="true">Only what you allow.</span>
              </h1>
              <div className={s.heroSide}>
                <p>Credit lines your agent earns, your signature above them, and a key you can cut in one sentence. Enforced on Sui.</p>
                <div className={s.actions}>
                  <Link href="/app" className={`${s.pill} ${s.pillWhite}`}>Get started</Link>
                  <a href="#stories" className={`${s.pill} ${s.pillGlass}`}>See how <span aria-hidden="true">↓</span></a>
                </div>
              </div>
            </div>

            <div className={s.mockStage}>
              <DashboardMock />
              <p className={s.mockCaption}>An illustrative look inside Usual. <Link href="/app">Open the live testnet wallet <span aria-hidden="true">→</span></Link></p>
            </div>
          </div>
        </PinnedHero>

        {/* 3. Two-column statement. */}
        <section className={`${s.wrap} ${s.beat} ${s.split}`} data-reveal>
          <h2 className={s.h2}>Tell it what to pay for. Usual holds the line.</h2>
          <p className={s.lede}>An agent with your card can spend anything. An agent with Usual spends what its credit line allows, where you set it, and asks you about the rest.</p>
        </section>

        {/* 4. Edge-to-edge strip of use cases. Static: it scrolls only when you do. */}
        <section id="stories" className={s.strip} aria-label="What people ask Usual to pay for">
          <ul className={s.cards} data-reveal>
            {STORIES.map((c) => (
              <li key={c.tag} className={s.card}>
                <div className={s.cardPhoto}>
                  <Image src={`/people/${c.photo}.jpg`} alt={c.alt} fill sizes="(max-width: 700px) 78vw, 340px" />
                  <span className={s.cardTag}>{c.tag}</span>
                </div>
                <p className={s.cardAsk}>{c.ask}</p>
                <p className={s.cardRule}>{c.rule}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Big statement. */}
        <section id="how" className={`${s.wrap} ${s.beat} ${s.statement}`} data-reveal>
          <h2 className={s.giant}>The limit is a contract, not a promise.</h2>
          <p className={s.lede}>Limits aren&apos;t instructions in a prompt that a model can talk its way around. They are Sui allowances on your own wallet, and the chain enforces them.</p>
        </section>

        {/* 6. Steps. */}
        <section className={`${s.wrap} ${s.stepsBeat}`}>
          <ol className={s.steps}>
            {STEPS.map((st) => (
              <li key={st.n} className={s.step} data-reveal>
                <div className={s.stepHead}><span className={s.stepN}>{st.n}</span><Cube variant={st.cube} /></div>
                <h3>{st.title}</h3>
                <p>{st.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 7. Supported clients. */}
        <section className={`${s.wrap} ${s.beat}`}>
          <div className={s.split} data-reveal>
            <h2 className={s.h2}>Every agent, one wallet.</h2>
            <p className={s.lede}>Usual speaks the Model Context Protocol, so any client that runs MCP servers can be its voice. Payments settle in USDC on Sui, and memory lives in your own Walrus account.</p>
          </div>
          <ul className={s.logos} data-reveal>
            {CLIENTS.map((c) => <li key={c.name}><Logo name={c.logo} className={s.tileLogo} /><span>{c.name}</span></li>)}
          </ul>
        </section>

        {/* 8. FAQ. */}
        <section id="faq" className={`${s.wrap} ${s.beat} ${s.faq}`}>
          <h2 className={s.h2} data-reveal>Questions people ask first.</h2>
          <div className={s.faqList} data-reveal>
            {FAQ.map((f) => (
              <details key={f.q} className={s.faqItem} name="faq">
                <summary>{f.q}<span className={s.plus} aria-hidden="true" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 9. Photo CTA. */}
        <section className={s.cta}>
          <Image src="/people/closing.jpg" alt="" fill sizes="100vw" className={s.ctaPhoto} />
          <div className={s.ctaShade} aria-hidden="true" />
          <div className={`${s.wrap} ${s.ctaInner}`} data-reveal>
            <h2 className={s.giant}>Give your agent a budget, not your wallet.</h2>
            <div className={s.actions}>
              <Link href="/app" className={`${s.pill} ${s.pillWhite}`}>Get started</Link>
              <Link href="/cafe" className={`${s.pill} ${s.pillGlass}`}>Try the café counter</Link>
            </div>
            <p className={s.ctaNote}>Testnet only. Connect a wallet and Usual gives you test dollars.</p>
          </div>
        </section>
      </main>

      {/* 10. Footer. */}
      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footGrid}`}>
          <div className={s.footBrand}>
            <Link href="/" className={s.brand}><Mark className={s.brandMark} />Usual</Link>
            <p>A wallet with no buttons that learns how you talk about money.</p>
          </div>
          <div>
            <h3>Product</h3>
            <ul><li><Link href="/app">Open wallet</Link></li><li><Link href="/cafe">Café counter</Link></li><li><Link href="/proof">Proof</Link></li></ul>
          </div>
          <div>
            <h3>Learn</h3>
            <ul><li><a href="#stories">Use cases</a></li><li><a href="#how">How it works</a></li><li><a href="#faq">Questions</a></li></ul>
          </div>
          <div>
            <h3>Built on</h3>
            <ul>
              <li><a href="https://sui.io" target="_blank" rel="noreferrer">Sui</a></li>
              <li><a href="https://walrus.xyz" target="_blank" rel="noreferrer">Walrus Memory</a></li>
              <li><a href="https://tatum.io" target="_blank" rel="noreferrer">Tatum</a></li>
              <li><a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">Model Context Protocol</a></li>
            </ul>
          </div>
        </div>
        <div className={`${s.wrap} ${s.footBottom}`}>
          <span>Built for Total Recall · Tatum × Walrus</span>
          <span>Testnet. Play money only.</span>
        </div>
      </footer>
    </div>
  );
}
