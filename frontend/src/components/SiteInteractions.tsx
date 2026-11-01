"use client";

import { useEffect } from "react";

const SIGNUP = "/auth/signup";
const CONTACT_EMAIL = "hello@crevo.ai";

/** Click and form behaviour for the marketing pages: the mobile menu, the FAQ
 *  accordion, the footer newsletter form and the contact form. */
export default function SiteInteractions() {
  useEffect(() => {
    const closeMenus = () =>
      document.querySelectorAll("[data-menu-open]").forEach((el) => {
        el.removeAttribute("data-menu-open");
        el.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
      });

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;

      const toggle = target.closest("[data-menu-toggle]");
      if (toggle) {
        const wrapper = toggle.closest("nav")?.parentElement;
        if (!wrapper) return;
        const open = !wrapper.hasAttribute("data-menu-open");
        closeMenus();
        if (open) {
          const nav = wrapper.querySelector("nav");
          wrapper.style.setProperty("--menu-top", `${nav?.getBoundingClientRect().bottom ?? 64}px`);
          wrapper.setAttribute("data-menu-open", "");
          toggle.setAttribute("aria-expanded", "true");
        }
        return;
      }
      if (target.closest("[data-mobile-menu] a")) closeMenus();

      const faq = target.closest("[data-faq]");
      if (faq) {
        // Grouped items (Use cases) behave like tabs: exactly one stays open.
        const group = faq.getAttribute("data-faq-group");
        if (group) {
          document.querySelectorAll(`[data-faq-group="${group}"]`).forEach((el) => el.removeAttribute("data-open"));
          faq.setAttribute("data-open", "");
        } else {
          faq.toggleAttribute("data-open");
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target as Element;
      if (el.matches?.("[data-menu-toggle]") || (el.closest?.("[data-faq]") && el.hasAttribute("tabindex"))) {
        e.preventDefault();
        (el as HTMLElement).click();
      }
    };

    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!form.matches("[data-contact-form], [data-newsletter-form]")) return;
      const email = form.querySelector<HTMLInputElement>('input[type="email"]');
      if (!email) return;
      e.preventDefault();
      if (form.hasAttribute("data-contact-form")) {
        const value = (sel: string) => form.querySelector<HTMLInputElement>(sel)?.value.trim() ?? "";
        const name = value('input[name="Full Name"]');
        const subject = value('input[name="Subject"]') || "Hello from the Crevo site";
        const body = `${value("textarea")}\n\n— ${name}${email.value ? ` (${email.value})` : ""}`;
        location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return;
      }
      location.href = `${SIGNUP}?email=${encodeURIComponent(email.value)}`;
    };

    // Inputs carry an "-empty" class while blank, which the design styles.
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.classList?.contains("cv-form-input")) el.classList.toggle("cv-form-input-empty", !el.value);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("input", onInput);
    };
  }, []);
  return null;
}
