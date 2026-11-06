import type { Trip } from "@rickshare/shared";

export function TripNames({ trip }: { trip: Trip }) {
  if (!trip.ensName) return null;
  return (
    <details className="mb-6 rounded-ticket bg-card px-4 shadow-card">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">Group names</summary>
      <ul className="divide-y divide-rule pb-3">
        {trip.members.map((member) => (
          <li key={member.address} className="py-3">
            <p className="font-semibold">{member.displayName}</p>
            {member.ensName && <p className="break-all text-sm text-ink-muted">{member.ensName}</p>}
          </li>
        ))}
        <li className="py-3">
          <p className="font-semibold">Trip agent</p>
          <p className="break-all text-sm text-ink-muted">agent.{trip.ensName}</p>
        </li>
      </ul>
    </details>
  );
}
