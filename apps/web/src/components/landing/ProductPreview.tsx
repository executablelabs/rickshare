import {
  ArrowBendUpLeft,
  ArrowUp,
  ChatCircle,
  Check,
  CheckCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkle,
  Ticket,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Wordmark } from "../brand/Wordmark";
import { ProposalTicket } from "../plan/ProposalTicket";
import { Amount } from "../ui/Amount";
import { Avatar } from "../ui/Avatar";
import { AvatarStack } from "../ui/AvatarStack";
import { exampleMembers, exampleTicket, exampleViewer } from "./example-trip";
import { Postcard, RouteDoodle } from "./TravelDetails";

function WindowBar() {
  return (
    <div className="preview-windowbar" aria-hidden="true">
      <span />
      <span />
      <span />
      <p>rickshare / a good trip starts here</p>
    </div>
  );
}

function TripHeader() {
  return (
    <div className="preview-trip-header">
      <div>
        <span className="preview-overline">Your next adventure</span>
        <h3>
          India ’26 <span>↗</span>
        </h3>
        <p>Mumbai & Goa · 12–18 Dec</p>
      </div>
      <AvatarStack members={exampleMembers} onInk />
    </div>
  );
}

export function HeroProduct() {
  return (
    <figure aria-label="Example trip" className="hero-product" data-reveal>
      <Postcard className="hero-product__postcard" />
      <div className="hero-product__sticker" aria-hidden="true">
        <Sparkle size={17} weight="fill" /> More memories. Less maths.
      </div>
      <div className="product-window hero-product__window">
        <WindowBar />
        <TripHeader />
        <div className="preview-tabs" aria-hidden="true">
          <span data-active="true">
            <ChatCircle size={15} /> Plan
          </span>
          <span>Itinerary</span>
          <span>Money</span>
        </div>
        <div className="hero-product__ticket">
          <div className="preview-agent-note">
            <Sparkle size={17} weight="fill" />
            <p>A little adventure for Saturday?</p>
          </div>
          <ProposalTicket
            proposal={exampleTicket}
            members={exampleMembers}
            viewer={exampleViewer}
            actions={
              <a href="#your-share" className="preview-approve">
                Approve my share <ArrowUp size={17} className="preview-action-arrow" />
              </a>
            }
          />
        </div>
        <div className="preview-window-footer">
          <ShieldCheck size={14} />
          <span>Your share. Your say.</span>
          <span>Arc testnet</span>
        </div>
      </div>
      <div className="hero-product__receipt" aria-hidden="true">
        <span className="receipt-icon">
          <Check size={18} weight="bold" />
        </span>
        <div>
          <strong>Angie’s in.</strong>
          <span>Your share is still your call.</span>
        </div>
      </div>
      <RouteDoodle className="hero-product__route" />
      <figcaption>Example trip, not a live booking. Test USDC only.</figcaption>
    </figure>
  );
}

export function PlanProduct() {
  return (
    <figure className="plan-product" aria-label="Example collaborative trip planning" data-reveal>
      <div className="product-window plan-product__window">
        <WindowBar />
        <div className="plan-product__layout">
          <aside className="plan-product__rail" aria-hidden="true">
            <Wordmark tone="card" />
            <div className="plan-product__trip">
              <span>India ’26</span>
              <small>3 friends, one adventure</small>
            </div>
            <span className="plan-product__rail-active">
              <ChatCircle size={17} /> Plan
            </span>
            <span>
              <Ticket size={17} /> Itinerary
            </span>
            <span>
              <ShieldCheck size={17} /> Money
            </span>
            <div className="plan-product__invite">
              <Plus size={16} /> Invite friends
            </div>
          </aside>
          <div className="plan-product__feed">
            <div className="plan-product__heading">
              <div>
                <h3>The plan starts here.</h3>
                <span>India ’26 / Plan</span>
              </div>
              <AvatarStack members={exampleMembers} />
            </div>
            <div className="preview-message">
              <Avatar name="Angie" colorKey={exampleMembers[0].address} />
              <div>
                <span>
                  Angie <small>9:41</small>
                </span>
                <p>A beach day in Goa? Something a little adventurous, under $50 each.</p>
              </div>
            </div>
            <div className="preview-planner">
              <span className="preview-planner__avatar">
                <Sparkle size={18} weight="fill" />
              </span>
              <div>
                <strong>Rickshare planner</strong>
                <p>
                  How about a different view of the coast? I found tandem paragliding for Angie and
                  Gitau.
                </p>
              </div>
            </div>
            <div className="plan-suggestion">
              <div className="plan-suggestion__art" aria-hidden="true">
                <svg viewBox="0 0 320 110" fill="none" aria-hidden="true">
                  <path d="M0 85Q70 51 150 83T320 78V110H0Z" fill="var(--landing-mint)" />
                  <path
                    d="M78 50Q150 -12 222 50Q150 17 78 50Z"
                    fill="var(--landing-orange)"
                    stroke="var(--landing-ink)"
                    strokeWidth="2"
                  />
                  <path
                    d="M78 50L146 83L222 50M114 33L146 83L184 33"
                    stroke="var(--landing-ink)"
                    strokeWidth="1.5"
                  />
                  <circle cx="146" cy="84" r="4" fill="var(--landing-ink)" />
                </svg>
                <span>
                  <MapPin size={12} /> Arambol, Goa
                </span>
              </div>
              <div className="plan-suggestion__body">
                <span>Proposed experience</span>
                <h4>Tandem paragliding</h4>
                <div>
                  <p>Goa Adventures</p>
                  <strong>
                    <Amount value={42000000n} /> <small>/ person</small>
                  </strong>
                </div>
              </div>
            </div>
            <div className="preview-composer" aria-hidden="true">
              <Plus size={17} />
              <span>Ask for ideas, or make a plan…</span>
              <span>
                <ArrowUp size={17} />
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="plan-product__note" aria-hidden="true">
        <span>On the itinerary</span>
        <strong>
          Less “we should”.
          <br />
          More “we did”.
        </strong>
        <span>Goa, with the good ones. ↗</span>
      </div>
      <figcaption>
        Example conversation and proposal. The real Plan feed lives inside your trip.
      </figcaption>
    </figure>
  );
}

export function ApprovalProduct() {
  const [decision, setDecision] = useState<"waiting" | "approved" | "declined">("waiting");
  const proposal = {
    ...exampleTicket,
    status:
      decision === "approved"
        ? ("locked" as const)
        : decision === "declined"
          ? ("rejected" as const)
          : ("pending" as const),
    shares: exampleTicket.shares.map((share) =>
      share.member === exampleViewer
        ? {
            ...share,
            state:
              decision === "approved"
                ? ("approved" as const)
                : decision === "declined"
                  ? ("rejected" as const)
                  : ("waiting" as const),
          }
        : share,
    ),
  };

  return (
    <figure
      className="approval-product"
      aria-label="Interactive example of approving your share"
      data-reveal
    >
      <div className="approval-product__label">
        <span className="demo-dot" /> Try the approval flow <span>Interactive example</span>
      </div>
      <ProposalTicket
        proposal={proposal}
        members={exampleMembers}
        viewer={exampleViewer}
        pressed={decision === "approved" ? exampleViewer : undefined}
        actions={
          <div className="approval-product__actions">
            <button
              type="button"
              className="preview-approve"
              onClick={() => setDecision("approved")}
            >
              Approve my share <Check size={17} />
            </button>
            <button
              type="button"
              className="preview-decline"
              onClick={() => setDecision("declined")}
            >
              Not for me
            </button>
          </div>
        }
        footer={
          decision !== "waiting" ? (
            <div className="approval-result" role="status">
              <p>
                {decision === "approved"
                  ? "Everyone’s in. In a real trip, the shares can now lock for this proposal."
                  : "Not your thing? The proposal closes. Nobody is charged."}
              </p>
              <button type="button" onClick={() => setDecision("waiting")}>
                <ArrowBendUpLeft size={15} /> Try again
              </button>
            </div>
          ) : undefined
        }
      />
      <div className="approval-product__assurance">
        <CheckCircle size={20} weight="fill" />
        <span>
          Bashy isn’t in this activity.
          <br />
          <strong>His balance stays exactly where it is.</strong>
        </span>
      </div>
      <figcaption>This is a demo. No wallet prompt. No funds move.</figcaption>
    </figure>
  );
}
