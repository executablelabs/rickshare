import { PaperPlaneRight } from "@phosphor-icons/react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";

const MAX_LENGTH = 2000;

/** The message box under the feed. Enter sends; Shift+Enter starts a new line. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with the text up to about five lines, then scroll.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  });

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 -mx-5 bg-paper px-5 pt-3 pb-1 lg:bottom-0 lg:mx-0 lg:px-0 lg:pb-6"
    >
      <label htmlFor="ask" className="sr-only">
        Ask for ideas
      </label>
      <div className="flex items-end gap-2 rounded-ticket border border-rule bg-card py-2 pr-2 pl-4 shadow-card focus-within:ring-2 focus-within:ring-stamp">
        <textarea
          id="ask"
          ref={box}
          rows={1}
          maxLength={MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask for ideas, like two days in Goa under $100 each"
          className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled || !value.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-control bg-ink text-card hover:bg-ink/90 disabled:opacity-40"
        >
          <PaperPlaneRight aria-hidden="true" size={20} />
        </button>
      </div>
    </form>
  );
}
