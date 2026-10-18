import type { Metadata } from "next";
import { CUES } from "@/shared/delivery";
import { EFFECTS } from "@/shared/effects";
import { COMING_SOON_RULES, EXAMPLE_SCRIPT_V2, FORMAT_RULES, aiPrompt } from "@/shared/script/guide";
import { Card, SectionLabel } from "@/components/ui";
import { CopyButton, UseExampleButton } from "./guide-actions";

export const metadata: Metadata = { title: "Script guide" };

export default function GuidePage() {
  const prompt = aiPrompt();
  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Reference</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Script guide</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Plain text, easy to write by hand. Share the AI prompt below with ChatGPT or any writer, and their scripts come out
        ready to generate.
      </p>

      <Card className="mt-8 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Prompt for AI writers</h2>
            <p className="text-sm text-muted">Teaches the exact format with an example. Replace the last line with your idea.</p>
          </div>
          <CopyButton text={prompt} label="Copy AI prompt" />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">Show the prompt</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-control border border-line bg-raised p-4 font-mono text-xs leading-relaxed">
            {prompt}
          </pre>
        </details>
      </Card>

      <section aria-labelledby="rules" className="mt-10">
        <SectionLabel>
          <span id="rules">The format</span>
        </SectionLabel>
        <Card className="mt-3 divide-y divide-line">
          {FORMAT_RULES.map((r) => (
            <div key={r.syntax} className="grid gap-1 p-4 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <code className="font-mono text-sm text-accent">{r.syntax}</code>
              <div className="text-sm">
                <p>{r.meaning}</p>
                {r.example && <code className="mt-1 block font-mono text-xs text-muted">{r.example}</code>}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="cues" className="mt-10">
        <SectionLabel>
          <span id="cues">Delivery cues</span>
        </SectionLabel>
        <p className="mt-2 text-sm text-muted">
          Free voices change speed, pitch and volume to suggest the feeling. With Azure Speech connected, cues marked
          &ldquo;real&rdquo; use genuine acted styles on voices that support them.
        </p>
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3 font-normal">Cue</th>
                <th className="p-3 font-normal">Sounds like</th>
                <th className="p-3 font-normal">Also accepted</th>
                <th className="p-3 font-normal">With Azure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CUES.map((c) => (
                <tr key={c.name}>
                  <td className="p-3 font-mono text-accent">({c.name})</td>
                  <td className="p-3">{c.description}</td>
                  <td className="p-3 text-muted">{c.aliases.join(", ")}</td>
                  <td className="p-3 text-muted">{c.azureStyle ? "Real style" : "Same as free"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="effects" className="mt-10">
        <SectionLabel>
          <span id="effects">Motion effects</span>
        </SectionLabel>
        <p className="mt-2 text-sm text-muted">
          Write <code className="font-mono text-accent">[fx: flicker, shake]</code> under a scene. Effects move the whole
          picture (light, camera, haze), so a spinning winch reads as running machinery rather than a turning object. The
          editor suggests effects from the scene description. Use them where the scene calls for it, not everywhere.
        </p>
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3 font-normal">Effect</th>
                <th className="p-3 font-normal">Looks like</th>
                <th className="p-3 font-normal">Also accepted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {EFFECTS.map((e) => (
                <tr key={e.name}>
                  <td className="p-3 font-mono text-accent">{e.name}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-muted">{e.aliases.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="example" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>
            <span id="example">Example</span>
          </SectionLabel>
          <div className="flex gap-2">
            <CopyButton text={EXAMPLE_SCRIPT_V2} label="Copy example" />
            <UseExampleButton script={EXAMPLE_SCRIPT_V2} />
          </div>
        </div>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-card border border-line bg-surface p-5 font-mono text-[13px] leading-6">
          {EXAMPLE_SCRIPT_V2}
        </pre>
      </section>

      <section aria-labelledby="soon" className="mt-10">
        <SectionLabel>
          <span id="soon">Coming soon</span>
        </SectionLabel>
        <p className="mt-2 text-sm text-muted">Recognised already (the editor notes them), not played yet.</p>
        <Card className="mt-3 divide-y divide-line">
          {COMING_SOON_RULES.map((r) => (
            <div key={r.syntax} className="grid gap-1 p-4 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <code className="font-mono text-sm text-muted">{r.syntax}</code>
              <div className="text-sm">
                <p>{r.meaning}</p>
                <code className="mt-1 block font-mono text-xs text-muted">{r.example}</code>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
