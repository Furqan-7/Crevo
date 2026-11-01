/** The dropdown opened by the hamburger button on tablet and phone widths.
 *  Shown and hidden by SiteInteractions via the data-menu-open attribute. */
const LINKS = [
  { href: "/#features", label: "Product" },
  { href: "/#use-cases", label: "Use Cases" },
  { href: "/#examples", label: "Examples" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/contact-us", label: "Contact Us" },
  { href: "/auth/signin", label: "Sign in" },
];

export default function MobileMenu() {
  return (
    <div className="crevo-mobile-menu" data-mobile-menu="">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} className="crevo-mobile-menu__link">
          {l.label}
        </a>
      ))}
      <a href="/auth/signup" className="crevo-mobile-menu__cta">
        Sign up free
      </a>
    </div>
  );
}
