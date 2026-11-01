"use client";

import { useEffect } from "react";

/** Highlights the "How it works" step that matches how far the visitor has
 *  scrolled through the section. On wide screens the steps are pinned
 *  (position: sticky) inside a tall track, so progress through the track picks
 *  the step; on narrow screens the step nearest the middle of the screen wins. */
export default function StepHighlight() {
  useEffect(() => {
    let frame = 0;

    const stickyAncestor = (el: Element | null): HTMLElement | null => {
      for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
        if (getComputedStyle(node).position === "sticky") return node;
      }
      return null;
    };

    const update = () => {
      frame = 0;
      // One group of steps per breakpoint; only the visible one matters.
      const groups = new Map<Element, HTMLElement[]>();
      document.querySelectorAll<HTMLElement>("[data-step]").forEach((step) => {
        const group = step.parentElement?.parentElement?.parentElement;
        if (!group) return;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(step);
      });

      groups.forEach((steps) => {
        const visible = steps.some((s) => [...s.children].some((c) => (c as HTMLElement).offsetParent));
        if (!visible) return;
        let index = 0;
        const sticky = stickyAncestor(steps[0]);
        const track = sticky?.parentElement;
        if (sticky && track && track.offsetHeight > sticky.offsetHeight + 50) {
          const rect = track.getBoundingClientRect();
          const distance = track.offsetHeight - sticky.offsetHeight;
          const progress = Math.min(Math.max(-rect.top / distance, 0), 0.999);
          index = Math.floor(progress * steps.length);
        } else {
          const middle = window.innerHeight * 0.45;
          let best = Infinity;
          steps.forEach((s, i) => {
            const r = [...s.children].map((c) => c.getBoundingClientRect()).find((b) => b.height > 0);
            if (!r) return;
            const d = Math.abs(r.top + r.height / 2 - middle);
            if (d < best) {
              best = d;
              index = i;
            }
          });
        }
        steps.forEach((s, i) => s.toggleAttribute("data-active", i === index));
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
