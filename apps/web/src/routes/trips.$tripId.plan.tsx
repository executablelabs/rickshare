import { Sparkle, Wallet } from "@phosphor-icons/react";
import type { ChatMessage } from "@rickshare/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "../auth/wallet";
import { Loader } from "../components/brand/Loader";
import { TravelError, TravelIntro } from "../components/brand/Travel";
import { ActivitySelection } from "../components/plan/ActivitySelection";
import { Composer } from "../components/plan/Composer";
import { Feed } from "../components/plan/Feed";
import { FundingAddress } from "../components/trips/FundingAddress";
import { ReadyChecklist } from "../components/trips/ReadyChecklist";
import { useTripActions } from "../components/trips/TripActions";
import { Amount } from "../components/ui/Amount";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { messageOf } from "../lib/http";
import { mergeMessages, planKeys, sendChat, useChat, useProposals } from "../lib/plan";
import { useMoney } from "../lib/trips";

export const Route = createFileRoute("/trips/$tripId/plan")({
  component: Plan,
});

function Plan() {
  const { trip, open } = useTripActions();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const chat = useChat(trip.id);
  const proposals = useProposals(trip.id);
  const money = useMoney(trip.id);
  const [draft, setDraft] = useState("");
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const retry = useRef<{ requestId: string; text: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const messages = chat.data ?? [];
  // The planner is working until its reply to our request arrives, by response or by stream.
  const thinking =
    waitingFor !== null &&
    !messages.some((message) => message.role === "agent" && message.clientRequestId === waitingFor);

  useEffect(() => {
    if (!thinking && waitingFor) {
      setWaitingFor(null);
      retry.current = null;
    }
  }, [thinking, waitingFor]);

  // Keep the newest message in view as the conversation grows.
  const count = messages.length + (thinking ? 1 : 0);
  useEffect(() => {
    if (count > 0) end.current?.scrollIntoView?.({ block: "end" });
  }, [count]);

  function send(text: string) {
    if (!wallet.address) return;
    const requestId = retry.current?.text === text ? retry.current.requestId : crypto.randomUUID();
    retry.current = { requestId, text };
    const optimistic: ChatMessage = {
      id: `pending:${requestId}`,
      clientRequestId: requestId,
      tripId: trip.id,
      role: "member",
      author: wallet.address,
      text,
      proposalIds: [],
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData<ChatMessage[]>(planKeys.chat(trip.id), (current) =>
      mergeMessages(current ?? [], [optimistic]),
    );
    setDraft("");
    setWaitingFor(requestId);
    sendChat(trip.id, requestId, text)
      .then((result) => {
        if (result.status !== "complete" && result.status !== "processing") {
          queryClient.setQueryData<ChatMessage[]>(planKeys.chat(trip.id), (current) =>
            (current ?? []).filter((message) => message.id !== optimistic.id),
          );
          setWaitingFor(null);
          setDraft(text);
          showToast("That request stopped. Check the plan before sending a new request.", {
            tone: "error",
          });
        }
        if (result.reply)
          queryClient.setQueryData<ChatMessage[]>(planKeys.chat(trip.id), (current) =>
            mergeMessages(
              current ?? [],
              [result.reply?.memberMessage, result.reply?.agentMessage].flatMap((m) =>
                m ? [m] : [],
              ),
            ),
          );
        // New proposals arrive on the stream too; this catches them if the stream is behind.
        void queryClient.invalidateQueries({ queryKey: planKeys.proposals(trip.id) });
      })
      .catch((error: unknown) => {
        const completed = queryClient
          .getQueryData<ChatMessage[]>(planKeys.chat(trip.id))
          ?.some((message) => message.role === "agent" && message.clientRequestId === requestId);
        if (completed) {
          retry.current = null;
          setWaitingFor(null);
          return;
        }
        queryClient.setQueryData<ChatMessage[]>(planKeys.chat(trip.id), (current) =>
          (current ?? []).filter((message) => message.id !== optimistic.id),
        );
        setWaitingFor(null);
        setDraft(text);
        showToast(messageOf(error), { tone: "error" });
      });
  }

  return (
    <div className="travel-plan">
      <TravelIntro
        title="Plan"
        description="A few good ideas. A whole trip to make them happen."
        vehicle="bus"
      />
      <section className="travel-planning-balance" aria-labelledby="planning-money-title">
        <div className="travel-kicker">
          <Wallet size={20} aria-hidden="true" />
          <h2 id="planning-money-title">Your wallet, ready for the trip</h2>
        </div>
        {money.isError ? (
          <div role="alert">
            <p>{messageOf(money.error)}</p>
            <Button variant="secondary" onClick={() => void money.refetch()}>
              Try again
            </Button>
          </div>
        ) : money.data ? (
          <>
            <div className="travel-planning-balance__amounts">
              <div>
                <span>In your wallet</span>
                <Amount value={BigInt(money.data.walletBalance)} display />
              </div>
            </div>
            <div className="travel-planning-balance__actions">
              <Button
                variant="secondary"
                onClick={() => open("addMoney")}
                disabled={money.data.settled || Date.parse(trip.endsAt) <= Date.now()}
              >
                Add money
              </Button>
              <Button
                variant="secondary"
                onClick={() => open("limits")}
                disabled={money.data.settled || Date.parse(trip.endsAt) <= Date.now()}
              >
                My limits
              </Button>
            </div>
            <details>
              <summary>Fund your wallet</summary>
              <FundingAddress />
            </details>
          </>
        ) : (
          <Loader label="Loading your planning balance" />
        )}
      </section>
      <div className="travel-plan__workspace">
        <div className="travel-plan__chat">
          <div className="travel-conversation">
            <div className="travel-conversation__bar">
              <Sparkle size={20} aria-hidden="true" /> The group plan
            </div>
            {chat.isPending || proposals.isPending ? (
              <Loader label="Loading the plan" />
            ) : chat.isError || proposals.isError ? (
              <TravelError
                error={chat.error ?? proposals.error}
                onRetry={() => {
                  void chat.refetch();
                  void proposals.refetch();
                }}
              />
            ) : (
              <Feed
                messages={messages}
                proposals={proposals.data}
                thinking={thinking}
                onSuggest={setDraft}
              />
            )}
            <ActivitySelection key={trip.id} messages={messages} />
            <div ref={end} />
          </div>
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            disabled={thinking}
            location={trip.location ?? null}
          />
        </div>
        <ReadyChecklist />
      </div>
    </div>
  );
}
