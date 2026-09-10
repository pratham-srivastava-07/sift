"use client";
import { FormEvent, useState } from "react";

type State = "idle" | "loading" | "done" | "error";
export default function Home() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  async function run(event: FormEvent) {
    event.preventDefault(); setError(""); setResult(null);
    try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) throw new Error("Use an HTTP or HTTPS URL."); if (!prompt.trim()) throw new Error("Describe what you want to extract."); }
    catch (e) { setState("error"); setError(e instanceof Error ? e.message : "Check your input."); return; }
    setState("loading");
    try { const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, prompt }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Extraction failed."); setResult(body); setState("done"); }
    catch (e) { setState("error"); setError(e instanceof Error ? e.message : "Extraction failed."); }
  }

  return <main className="extractor-shell">
    <header className="nav"><a className="wordmark" href="/">SIFT<span>.</span></a><span className="nav-status"><i /> live extraction engine</span></header>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">Web research, shaped by your question</p><h1>Ask a page<br/><em>for its facts.</em></h1><p className="hero-lede">Give us any public website and describe the fields you need. Fieldwork reads the page, follows relevant links when necessary, and returns a clean object.</p></div><div className="hero-note"><span>01</span><p>One prompt<br/>Any public site<br/>Five pages max</p></div></section>
    <section className="workbench"><form className="brief" onSubmit={run}><div className="brief-head"><span>Extraction brief</span><b>/{state === "loading" ? " working" : " ready"}</b></div><label>Source URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://â€¦" autoComplete="url" /></label><label>What should I find?<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Get the title, current price, and shipping policy for this product" rows={5}/></label><button disabled={state === "loading"}>{state === "loading" ? "Reading pagesâ€¦" : "Run extraction"}<span>â†—</span></button><p className="brief-foot">Public HTTP(S) pages Â· same-site links only Â· results validated on the server</p></form><section className="output" aria-live="polite"><div className="output-head"><span>Output</span><span>{state === "done" ? "validated JSON" : state === "loading" ? "in progress" : "waiting for a brief"}</span></div>{state === "idle" && <div className="output-empty"><div className="signal">âŒ</div><h2>Nothing collected yet.</h2><p>Your answer will appear here as a structured object, ready for your app or workflow.</p><div className="schema-hint">{`{  "field": "value" }`}</div></div>}{state === "loading" && <div className="output-empty"><div className="loader"/><h2>Following the useful thread.</h2><p>Reading the supplied page, checking its content, and stopping when the requested fields are complete.</p></div>}{state === "error" && <div className="output-empty"><div className="error-symbol">!</div><h2>That run could not finish.</h2><p className="error-copy">{error}</p><button className="retry" onClick={run}>Try again <span>â†—</span></button></div>}{state === "done" && result && <div className="json-result"><div className="json-bar"><span>result.json</span><button type="button" onClick={()=>navigator.clipboard?.writeText(JSON.stringify(result,null,2))}>Copy object</button></div><pre>{JSON.stringify(result,null,2)}</pre><p className="null-note">A null value means the field was requested but not found in the allowed crawl.</p></div>}</section></section>
    <footer className="footer"><span>Fieldwork / extraction engine</span><span>Built for clear boundaries</span></footer>
  </main>;
}
