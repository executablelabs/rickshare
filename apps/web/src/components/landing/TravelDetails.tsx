import { ArrowUpRight, MapPin } from "@phosphor-icons/react";

export function Postcard({ className = "" }: { className?: string }) {
  return (
    <div className={`travel-postcard ${className}`} aria-hidden="true">
      <div className="travel-postcard__photo">
        <img
          src="https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=85"
          alt=""
          width="600"
          height="420"
          loading="lazy"
        />
        <span>
          Meet you in
          <br />
          Mumbai.
        </span>
      </div>
      <div className="travel-postcard__caption">
        <span>A little further, together.</span>
        <ArrowUpRight size={18} />
      </div>
    </div>
  );
}

export function RouteDoodle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`travel-route ${className}`}
      viewBox="0 0 240 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 110C53 115 24 38 84 47C145 57 79 118 132 112C187 105 157 13 219 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="110" r="4" fill="currentColor" />
      <path d="M211 9L227 19L211 27L214 19Z" fill="currentColor" />
    </svg>
  );
}

export function DestinationStamp() {
  return (
    <div className="destination-stamp" aria-hidden="true">
      <MapPin size={24} weight="duotone" />
      <strong>Go places.</strong>
      <span>With your people.</span>
    </div>
  );
}
