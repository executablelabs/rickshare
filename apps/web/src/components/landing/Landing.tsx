import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  GlobeHemisphereWest,
  LockKey,
  ShieldCheck,
  Sparkle,
  UsersThree,
} from "@phosphor-icons/react";
import { useWallet } from "../../auth/wallet";
import { SignInButton } from "../auth/SignInButton";
import { Wordmark } from "../brand/Wordmark";
import { JourneyIndicator } from "./JourneyIndicator";
import { LandingNav } from "./LandingNav";
import { ApprovalProduct, HeroProduct, PlanProduct } from "./ProductPreview";
import { DestinationStamp, RouteDoodle } from "./TravelDetails";
import { useLandingJourney } from "./useLandingJourney";
import "./landing.css";

export function Landing() {
  const wallet = useWallet();
  const vehicle = useLandingJourney();

  return (
    <div className="landing">
      <a className="landing-skip" href="#main-content">
        Skip to content
      </a>
      <LandingNav vehicle={vehicle} />
      <JourneyIndicator vehicle={vehicle} />
      <main id="main-content">
        <section id="top" className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-container landing-hero__grid">
            <div className="landing-hero__copy" data-reveal>
              <div className="landing-eyebrow">
                <span className="landing-eyebrow__dot" /> Good company. Great adventures.
              </div>
              <h1 id="hero-title">
                <span>Plan together.</span>
                <span>Go further.</span>
                <span className="landing-hero__pay">Pay only your share.</span>
              </h1>
              <p className="landing-lead">
                Big ideas in the group chat? Make them happen. Plan with friends, find your next
                experience, and keep your share in your hands.
              </p>
              <div className="landing-hero__actions">
                <SignInButton className="landing-button landing-button--navy" />
                <a className="landing-text-link" href="#how">
                  How it works <ArrowDown size={17} />
                </a>
              </div>
              {!wallet.configured && (
                <p role="status" className="landing-setup-notice">
                  Sign-in is being set up. Please contact the trip organizer.
                </p>
              )}
              <div className="landing-hero__trust">
                <span>
                  <ShieldCheck size={18} /> Your money. Your say.
                </span>
                <span className="landing-hero__testnet">Built on Arc testnet</span>
              </div>
            </div>
            <HeroProduct />
          </div>
          <div className="landing-hero__bottom landing-container">
            <span>A shared trip. Not a shared headache.</span>
            <a href="#how" aria-label="Explore how Rickshare works">
              <ArrowDown size={19} />
            </a>
            <span>Made for the people you go with.</span>
          </div>
        </section>

        <section id="how" className="landing-plan" aria-labelledby="how-title">
          <div className="landing-container">
            <div className="landing-section-top">
              <span className="landing-section-index">01 / Make a plan</span>
              <span className="landing-section-aside">
                <UsersThree size={17} /> Better with your people
              </span>
            </div>
            <div className="landing-plan__intro" data-reveal>
              <div>
                <p className="landing-kicker">How it works</p>
                <h2 id="how-title">
                  The group chat has ideas.
                  <br />
                  <span>Rickshare makes the plan.</span>
                </h2>
              </div>
              <p>
                From “anyone up for Goa?” to an actual plan. Bring your people, ask the planner, and
                turn a good idea into everyone’s next adventure.
              </p>
            </div>
            <div className="landing-plan__showcase">
              <PlanProduct />
              <div className="landing-plan__steps" data-reveal>
                <div className="landing-mini-label">
                  <Sparkle size={17} /> Less back-and-forth. More getting there.
                </div>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <h3>Your trip, your people.</h3>
                      <p>Name the adventure, pick an end date, and send your friends an invite.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h3>Good ideas become real options.</h3>
                      <p>
                        Ask the planner for experiences that fit your group, with prices and
                        individual shares.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h3>Everyone gets a say.</h3>
                      <p>
                        Propose an activity. Each person decides on their own part. No awkward
                        chasing.
                      </p>
                    </div>
                  </li>
                </ol>
                <a className="landing-text-link" href="#your-share">
                  Let’s talk about your share <ArrowRight size={18} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="your-share" className="landing-control" aria-labelledby="control-title">
          <div className="landing-container">
            <div className="landing-section-top">
              <span className="landing-section-index">02 / Keep your say</span>
              <span className="landing-section-aside">
                <LockKey size={17} /> Shared plans. Personal control.
              </span>
            </div>
            <div className="landing-control__grid">
              <div className="landing-control__copy" data-reveal>
                <p className="landing-kicker">Everyone pays their part</p>
                <h2 id="control-title">
                  One group adventure.
                  <br />
                  <span>
                    Your money.
                    <br />
                    Your call.
                  </span>
                </h2>
                <p className="landing-lead">
                  You’re in for the trip. That doesn’t mean you’re in for everything.
                </p>
                <p>
                  Approve only your own share, or set your own automatic approval limits. Being in
                  the group never gives someone else control of your money.
                </p>
                <ul className="landing-control__promises">
                  <li>
                    <Check size={17} /> Not taking part? Your balance doesn’t move.
                  </li>
                  <li>
                    <Check size={17} /> Merchants are paid when tickets are issued.
                  </li>
                  <li>
                    <Check size={17} /> Unspent funds remain yours to withdraw.
                  </li>
                </ul>
                <div className="landing-control__note">
                  <ShieldCheck size={22} />
                  <p>
                    Only your approval or the limits you set can authorize your share. The contract
                    enforces it.
                  </p>
                </div>
              </div>
              <ApprovalProduct />
            </div>
          </div>
        </section>

        <section id="ready" className="landing-ready" aria-labelledby="ready-title">
          <div className="landing-container">
            <div className="landing-section-top">
              <span className="landing-section-index">03 / Ready for takeoff</span>
              <span className="landing-section-aside">
                <GlobeHemisphereWest size={17} /> The next stop is yours
              </span>
            </div>
            <div className="landing-ready__content" data-reveal>
              <DestinationStamp />
              <p className="landing-kicker">Less admin. More adventure.</p>
              <h2 id="ready-title">
                Good trips
                <br />
                start together.
              </h2>
              <p>
                Your people. Your plans. Your own say.
                <br />
                Bring the group. We’ll help with the rest.
              </p>
              <div className="landing-boarding-pass">
                <div>
                  <span>Your next adventure</span>
                  <strong>
                    Group chat <ArrowRight size={20} /> Going places
                  </strong>
                </div>
                <span className="landing-boarding-pass__perforation" aria-hidden="true" />
                <SignInButton className="landing-button landing-button--navy" />
              </div>
              <span className="landing-ready__signin">
                Sign in with Google, email, or your existing wallet.
              </span>
              <RouteDoodle className="landing-ready__route" />
            </div>
            <footer className="landing-footer">
              <a href="#top" aria-label="Rickshare home">
                <Wordmark vehicle="plane" />
              </a>
              <p>
                Runs on Arc testnet with test USDC.
                <br />
                <span>A little adventure. No real-money payments or travel bookings.</span>
              </p>
              <a
                href="https://github.com/executablelabs/rickshare"
                target="_blank"
                rel="noreferrer"
              >
                Explore the project <ArrowUpRight size={16} />
              </a>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
