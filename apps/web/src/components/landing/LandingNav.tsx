import { List, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { SignInButton } from "../auth/SignInButton";
import type { Vehicle } from "../brand/TransportMark";
import { Wordmark } from "../brand/Wordmark";

export function LandingNav({ vehicle }: { vehicle: Vehicle }) {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnNavigation = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a, .landing-button"))
        setOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("click", dismissOnNavigation);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("click", dismissOnNavigation);
    };
  }, [open]);

  return (
    <header ref={header} className="landing-nav" data-journey={vehicle}>
      <div className="landing-nav__inner">
        <a href="#top" aria-label="Rickshare home" className="landing-nav__brand">
          <Wordmark vehicle={vehicle} />
        </a>
        <nav aria-label="Main navigation" className="landing-nav__desktop">
          <a href="#how" aria-current={vehicle === "bus" ? "location" : undefined}>
            How it works
          </a>
          <a href="#your-share" aria-current={vehicle === "train" ? "location" : undefined}>
            Your money, your call
          </a>
        </nav>
        <div className="landing-nav__actions">
          <SignInButton
            label="Sign in"
            variant="secondary"
            className="landing-button landing-button--quiet landing-nav__signin"
          />
          <SignInButton className="landing-button landing-button--navy landing-nav__start" />
          <button
            ref={toggle}
            type="button"
            className="landing-nav__toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={23} /> : <List size={23} />}
          </button>
        </div>
      </div>
      <nav
        id="marketing-menu"
        aria-label="Mobile navigation"
        className="landing-nav__mobile"
        hidden={!open}
      >
        <a href="#how">How it works</a>
        <a href="#your-share">Your money, your call</a>
        <a href="#ready">Start your next trip</a>
        <SignInButton label="Sign in" className="landing-button landing-button--navy" />
      </nav>
    </header>
  );
}
