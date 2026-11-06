import { useEffect, useState } from "react";
import type { Vehicle } from "../brand/TransportMark";

export const landingStops = [
  { id: "top", vehicle: "rickshaw", label: "Start here" },
  { id: "how", vehicle: "bus", label: "Make a plan" },
  { id: "your-share", vehicle: "train", label: "Your share" },
  { id: "ready", vehicle: "plane", label: "Take off" },
] as const satisfies ReadonlyArray<{ id: string; vehicle: Vehicle; label: string }>;

export function useLandingJourney() {
  const [vehicle, setVehicle] = useState<Vehicle>("rickshaw");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const current = landingStops.find((stop) => stop.id === entry.target.id);
          if (current) setVehicle(current.vehicle);
        }
      },
      { rootMargin: "-22% 0px -65% 0px", threshold: 0 },
    );
    for (const stop of landingStops) {
      const section = document.getElementById(stop.id);
      if (section) observer.observe(section);
    }

    // Only animate a reveal while it is visible. Content is never hidden waiting for JavaScript.
    const reveals = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-entered", "true");
          reveals.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    for (const element of document.querySelectorAll(".landing [data-reveal]")) {
      reveals.observe(element);
    }
    return () => {
      observer.disconnect();
      reveals.disconnect();
    };
  }, []);

  return vehicle;
}
