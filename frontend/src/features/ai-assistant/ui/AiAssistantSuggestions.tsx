import { ArrowUpRight } from "lucide-react";

import type { AiAssistantSuggestion } from "../aiAssistantContract";
import { AiAssistantSuggestionMotion } from "../../../motion/AiAssistantMotion";
import { Button } from "../../../shared/ui/primitives/button";

export function AiAssistantSuggestions({
  items,
  onChoose,
}: {
  items: AiAssistantSuggestion[];
  onChoose(item: AiAssistantSuggestion): void;
}) {
  return (
    <div className="divide-y border-y" data-slot="ai-suggestion-list">
      {items.map((suggestion, index) => (
        <AiAssistantSuggestionMotion index={index} key={suggestion.id}>
          <Button
            className="group h-auto min-h-10 w-full min-w-0 justify-between rounded-none px-0 py-2 text-left"
            onClick={() => onChoose(suggestion)}
            type="button"
            variant="ghost"
          >
            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
              {suggestion.prompt}
            </span>
            <ArrowUpRight
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Button>
        </AiAssistantSuggestionMotion>
      ))}
    </div>
  );
}
