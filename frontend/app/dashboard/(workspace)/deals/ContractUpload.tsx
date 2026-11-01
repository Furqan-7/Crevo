"use client";

import type { ContractTermsInput } from "@api-types";
import { useEffect, useRef, useState } from "react";
import base from "../../dashboard.module.css";
import styles from "./contract.module.css";
import { AppLayer } from "../../_shell/states";
import { cx, healthColor } from "../../_shell/ui";
import { HEALTH_MAX, dealStages } from "../../data";
import { ApiError, api } from "../../_shell/api";
import { SAMPLE_CLAUSES, assess, fromContractRead, sampleTerms, toContractInput, type Clauses, type ContractTerms } from "./contract";

const READING = ["Reading 9 pages", "Finding the fee and deliverables", "Checking payment terms and usage rights", "Scoring Deal Health"];

// Upload a contract → Crevo reads it → review the terms → add the deal.
export default function ContractUpload({ onClose, onAdd }: { onClose: () => void; onAdd: (terms: ContractTermsInput) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [reading, setReading] = useState(0);
  const [terms, setTerms] = useState<ContractTerms>(sampleTerms);
  const [clauses, setClauses] = useState<Clauses>(SAMPLE_CLAUSES);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  // Walk through the reading stages, one every 600ms; the last one waits
  // for the API when a real contract is being read.
  useEffect(() => {
    if (!file || reading >= READING.length || (pending && reading >= READING.length - 1)) return;
    const t = setTimeout(() => setReading((r) => r + 1), 600);
    return () => clearTimeout(t);
  }, [file, reading, pending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof ContractTerms>(k: K, v: ContractTerms[K]) => setTerms((t) => ({ ...t, [k]: v }));
  const result = assess(terms);
  const done = file !== null && reading >= READING.length && !pending;

  // The sample contract.
  function start(name: string) {
    setFile(name);
    setReading(0);
    setTerms(sampleTerms());
    setClauses(SAMPLE_CLAUSES);
    setDocumentId(null);
    setError(null);
  }

  // A real contract: the API reads it (text, terms and clause numbers).
  async function read(f: File) {
    setFile(f.name);
    setReading(0);
    setPending(true);
    setError(null);
    try {
      const result = await api.readContract(f);
      const form = fromContractRead(result);
      setTerms(form.terms);
      setClauses(form.clauses);
      setDocumentId(result.documentId);
      setPending(false);
    } catch (err) {
      setPending(false);
      setFile(null);
      setError(err instanceof ApiError ? err.message : "Couldn't read that contract. Try again.");
    }
  }

  const clause = (k: keyof ContractTerms) => clauses[k] && <small className={base.mono}>{clauses[k]}</small>;

  return (
    <AppLayer>
      <div className={base.overlay} onClick={onClose}>
        <div className={cx(base.modal, styles.modal)} role="dialog" aria-modal="true" aria-labelledby="contract-title" onClick={(e) => e.stopPropagation()}>
          <div className={base.eyebrow}><span>[</span>{!file ? "upload contract" : done ? "review terms" : "reading"}<span>]</span></div>
          <h3 id="contract-title" className={base.modalTitle}>
            {!file ? "Add a deal from a contract" : done ? `${terms.brand || "New deal"} · check the terms` : `Reading ${file}`}
          </h3>

          {!file && (
            <>
              <div
                className={cx(styles.drop, dragging && styles.dropOn)}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) read(f);
                }}
              >
                <strong>Drop a PDF contract</strong>
                <small>Crevo finds the fee, deliverables, deadline, usage rights and payment terms, then scores the deal.</small>
                <div className={styles.row}>
                  <button type="button" className={base.btnDark} onClick={() => input.current?.click()}>Choose a file</button>
                  <button type="button" className={base.btnGhost} onClick={() => start("sony-alpha-agreement.pdf")}>Use a sample contract</button>
                </div>
              </div>
              <input
                ref={input}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) read(f);
                  e.target.value = "";
                }}
              />
              {error && <p className={cx(base.modalNote, styles.error)} role="alert">{error}</p>}
              <p className={base.modalNote}>Contracts stay private to your workspace. Nothing is signed or sent.</p>
            </>
          )}

          {file && !done && (
            <ul className={styles.reading} aria-live="polite">
              {READING.map((label, i) => (
                <li key={label} className={cx(i < reading && styles.readDone, i === reading && styles.readNow)}>
                  <span aria-hidden="true">{i < reading ? "✓" : i === reading ? "…" : ""}</span>
                  {label}
                </li>
              ))}
            </ul>
          )}

          {done && (
            <>
              <div className={styles.score}>
                <span className={styles.scoreNum} style={{ borderColor: healthColor(result.score) }}>
                  <strong>{result.score}</strong>
                  <small>/100</small>
                </span>
                <div>
                  <strong>Deal Health {result.score}</strong>
                  <small>
                    Financial {result.health.financial}/{HEALTH_MAX.financial} · Deadline {result.health.deadline}/{HEALTH_MAX.deadline} · Contract {result.health.contract}/{HEALTH_MAX.contract} · Scope {result.health.scope}/{HEALTH_MAX.scope}
                  </small>
                </div>
              </div>

              <div className={styles.grid}>
                <label className={styles.field}><span>Brand</span><input value={terms.brand} onChange={(e) => set("brand", e.target.value)} /></label>
                <label className={styles.field}><span>Campaign</span><input value={terms.campaign} onChange={(e) => set("campaign", e.target.value)} /></label>
                <label className={styles.field}><span>Fee (USD) {clause("fee")}</span><input type="number" min={0} step={100} value={terms.fee} onChange={(e) => set("fee", Math.max(0, Number(e.target.value)))} /></label>
                <label className={styles.field}><span>Due {clause("due")}</span><input type="date" value={terms.due} onChange={(e) => e.target.value && set("due", e.target.value)} /></label>
                <label className={cx(styles.field, styles.full)}><span>Deliverables {clause("deliverables")}</span><input value={terms.deliverables} onChange={(e) => set("deliverables", e.target.value)} /></label>
                <label className={styles.field}>
                  <span>Payment terms {clause("payment")}</span>
                  <select value={terms.payment} onChange={(e) => set("payment", e.target.value as ContractTerms["payment"])}>
                    {["Net 15", "Net 30", "Net 45", "Net 60", "Missing"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Revisions {clause("revisions")}</span>
                  <select value={terms.revisions} onChange={(e) => set("revisions", e.target.value as ContractTerms["revisions"])}>
                    {["1 round", "2 rounds", "Unlimited"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className={styles.field}><span>Usage rights, days {clause("usageDays")}</span><input type="number" min={0} value={terms.usageDays} onChange={(e) => set("usageDays", Math.max(0, Number(e.target.value)))} /></label>
                <label className={cx(styles.field, styles.check)}>
                  <input type="checkbox" checked={terms.usagePaid} onChange={(e) => set("usagePaid", e.target.checked)} />
                  <span>Usage is paid separately</span>
                </label>
                <label className={styles.field}>
                  <span>Add to</span>
                  <select value={terms.stage} onChange={(e) => set("stage", e.target.value as ContractTerms["stage"])}>
                    {dealStages.map((s) => <option key={s.stage}>{s.stage}</option>)}
                  </select>
                </label>
              </div>

              {result.risks.length > 0 ? (
                <ul className={styles.risks}>
                  {result.risks.map((r) => <li key={r.title}><strong>{r.title}</strong> {r.fix}</li>)}
                </ul>
              ) : (
                <p className={styles.clean}>✓ No risks found. Payment, revisions and usage look standard.</p>
              )}

              <div className={base.modalActions}>
                <button type="button" className={base.btnGhost} onClick={() => { setFile(null); setTerms(sampleTerms()); setDocumentId(null); }}>Upload another</button>
                <button type="button" className={base.btnDark} onClick={() => { setSaving(true); onAdd(toContractInput(terms, file!, documentId ? { documentId, clauses } : undefined)).finally(() => setSaving(false)); }} disabled={saving || !terms.brand.trim() || !terms.campaign.trim() || !terms.deliverables.trim()}>
                  Add to {terms.stage}
                </button>
              </div>
            </>
          )}

          {!done && (
            <div className={base.modalActions}>
              <button type="button" className={base.btnGhost} onClick={onClose}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </AppLayer>
  );
}
