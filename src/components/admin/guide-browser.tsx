"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ChefHat,
  Database,
  Gauge,
  Heart,
  KeyRound,
  Lightbulb,
  Lock,
  Radio,
  Receipt,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
  UserPlus,
} from "lucide-react";
import { GUIDE_SECTIONS, topicMatches, type GuideTopic } from "@/lib/admin/guide";
import { cn } from "@/lib/utils/format";

const ICONS: Record<string, LucideIcon> = {
  key: KeyRound,
  shield: ShieldCheck,
  "user-plus": UserPlus,
  receipt: Receipt,
  route: Route,
  chef: ChefHat,
  book: BookOpen,
  boxes: Boxes,
  sparkles: Sparkles,
  users: Users,
  gauge: Gauge,
  star: Star,
  radio: Radio,
  heart: Heart,
  settings: Settings,
  database: Database,
  lock: Lock,
};

/**
 * The ops guide. Every topic expands in place — the whole thing is one client
 * component so search filters instantly without a round trip, and the layout is
 * a single column on a phone so it reads as a manual rather than a wall of text.
 */
export function GuideBrowser({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(GUIDE_SECTIONS[0]?.topics[0]?.id ?? null);

  const sections = useMemo(
    () =>
      GUIDE_SECTIONS.map((section) => ({
        ...section,
        topics: section.topics.filter((topic) => topicMatches(topic, query)),
      })).filter((section) => section.topics.length > 0),
    [query],
  );

  const total = sections.reduce((sum, section) => sum + section.topics.length, 0);
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-30 -mx-4 bg-rice-100/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:px-0">
        <label className="relative block">
          <span className="sr-only">Search the guide</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — refunds, loyalty, stock, a role…"
            className="h-11 w-full rounded-xl border border-ink-900/12 bg-rice-50 ps-10 pe-3 text-sm text-ink-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </label>
        <p className="mt-1.5 text-xs text-ink-700/70" aria-live="polite">
          {searching
            ? `${total} ${total === 1 ? "topic" : "topics"} match “${query.trim()}”`
            : `${total} topics across ${sections.length} sections`}
        </p>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-ink-900/10 bg-rice-50 p-6 text-center text-sm text-ink-700/80">
          Nothing matched that. Try a shorter word, or ask an owner — this guide only
          documents what the console actually does.
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`guide-${section.id}`} className="space-y-2.5">
          <div>
            <h2
              id={`guide-${section.id}`}
              className="font-display text-lg font-semibold text-ink-900"
            >
              {section.title}
            </h2>
            {!searching ? (
              <p className="mt-0.5 text-sm text-ink-700/80">{section.intro}</p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            {section.topics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                open={openId === topic.id}
                canAct={!topic.capability || capabilities.includes(topic.capability)}
                onToggle={() => setOpenId((current) => (current === topic.id ? null : topic.id))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TopicCard({
  topic,
  open,
  canAct,
  onToggle,
}: {
  topic: GuideTopic;
  open: boolean;
  canAct: boolean;
  onToggle: () => void;
}) {
  const Icon = ICONS[topic.icon] ?? BookOpen;
  const panelId = `guide-topic-${topic.id}`;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-rice-50 transition-colors",
        open ? "border-indigo-500/40" : "border-ink-900/10",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 p-3.5 text-start"
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            open ? "bg-indigo-600 text-rice-50" : "bg-rice-200 text-ink-700",
          )}
        >
          <Icon className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink-900">{topic.title}</span>
            {!canAct ? (
              <span className="rounded-full bg-ink-900/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                Owner or admin
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-sm text-ink-700/80">{topic.summary}</span>
        </span>

        <ArrowRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-ink-500 transition-transform",
            open ? "rotate-90" : "rotate-0",
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="border-t border-ink-900/8 px-3.5 pb-3.5 pt-3">
          <ol className="space-y-3">
            {topic.steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-indigo-600/12 font-display text-xs font-semibold text-indigo-700"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-ink-700/85">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>

          {topic.tips?.length ? (
            <div className="mt-3.5 rounded-xl bg-miso-500/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-miso-700">
                <Lightbulb className="size-3.5" aria-hidden="true" />
                Good to know
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {topic.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-sm text-ink-800">
                    <span aria-hidden="true" className="text-miso-600">
                      ·
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
