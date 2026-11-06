import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Loader } from "../components/brand/Loader";
import { RickshawMark } from "../components/brand/RickshawMark";
import { Amount } from "../components/ui/Amount";
import { Avatar } from "../components/ui/Avatar";
import { AvatarStack } from "../components/ui/AvatarStack";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Field } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";

export const Route = createFileRoute("/dev/ui")({
  component: UiGallery,
});

// Gallery samples only; real members come from the trips API.
const sampleMembers = ["Angie", "Bashy", "Gitau", "Wanjiru", "Otieno"].map(
  (displayName, index) => ({
    address: `0x${String(index + 1).padStart(40, "0")}`,
    displayName,
  }),
);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function UiGallery() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const showToast = useToast();

  return (
    <main className="flex max-w-[560px] flex-col gap-8 px-5 py-8 lg:max-w-[760px] lg:px-10">
      <h1>UI gallery</h1>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Approve my share</Button>
          <Button variant="secondary">Add money</Button>
          <Button variant="destructive">Not for me</Button>
          <Button disabled>Approve my share</Button>
        </div>
        <Button fullWidth>Full width</Button>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip tone="action">Waiting for you</Chip>
          <Chip tone="stamp">Approved</Chip>
          <Chip tone="waiting">Waiting on Bashy</Chip>
          <Chip>Not in</Chip>
          <Chip tone="declined">Declined</Chip>
        </div>
      </Section>

      <Section title="Amounts">
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Amount value={42_000_000n} />
          <Amount value={84_000_000n} display className="text-3xl" />
          <span className="text-sm text-ink-muted">
            Your share <Amount value={28_333_333n} />
          </span>
        </p>
      </Section>

      <Section title="Avatars">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Angie" />
          <Avatar name="Bashy" size="sm" />
          <AvatarStack members={sampleMembers.slice(0, 3)} />
          <AvatarStack members={sampleMembers} />
        </div>
      </Section>

      <Section title="Fields">
        <Field label="Trip name" placeholder="India 26" hint="Up to 40 characters." />
        <Field
          label="Amount"
          inputMode="decimal"
          defaultValue="0"
          error="Enter an amount above $0.00."
        />
        <Field label="Disabled" disabled defaultValue="Locked" />
      </Section>

      <Section title="Sheet">
        <div>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            My limits
          </Button>
        </div>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="My limits"
          description="Shares under these limits are approved for you automatically."
        >
          <div className="flex flex-col gap-4">
            <Field label="Approve automatically up to" inputMode="decimal" defaultValue="25.00" />
            <Field label="Total cap" inputMode="decimal" defaultValue="300.00" />
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Save limits
            </Button>
          </div>
        </Sheet>
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => showToast("Share approved")}>
            Show success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              showToast("Your verification expired. Approve again to retry.", { tone: "error" })
            }
          >
            Show error
          </Button>
        </div>
      </Section>

      <Section title="Brand">
        <div className="flex flex-wrap items-end gap-6">
          <RickshawMark className="w-24 text-ink" />
          <RickshawMark className="w-12 text-ink" />
          <RickshawMark className="w-6 text-ink" />
        </div>
      </Section>

      <Section title="Loader">
        <Loader label="Loading trip" />
      </Section>
    </main>
  );
}
