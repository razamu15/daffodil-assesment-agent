/**
 * AgentCoreMemory: the real MemoryClient on Bedrock AgentCore Memory (Doc 3
 * §4.5, cheatsheet §5.3).
 *
 * Short-term: one conversational event per chat message (USER / ASSISTANT),
 * under one actor (the household; there is one user) and the chat's session.
 * Long-term: records the memory's strategies extract in the background,
 * retrieved per strategy namespace and returned as hints. Extraction is async,
 * so a fact said a minute ago may not be retrievable yet; nothing critical
 * depends on it.
 *
 * memoryId, actorId and the namespaces come from the caller (CDK outputs / env);
 * nothing is hardcoded. Not yet verified against a deployed memory resource (I2).
 *
 * Call sites: apps/local-server and the Agent Lambda wiring (I2/I3); the CLI when
 * AGENTCORE_MEMORY_ID is set.
 */
import { CreateEventCommand, ListEventsCommand, RetrieveMemoryRecordsCommand, Role } from "@aws-sdk/client-bedrock-agentcore";
import type {
  BedrockAgentCoreClient,
  CreateEventInput,
  Event,
  ListEventsInput,
  ListEventsOutput,
  RetrieveMemoryRecordsInput,
  RetrieveMemoryRecordsOutput,
  Role as RoleT,
} from "@aws-sdk/client-bedrock-agentcore";
import { ChatRole } from "@helper-assistant/domain";
import type { ChatMessage, ChatRole as ChatRoleT, Id, MemoryClient, MemoryHint, MemoryStrategy } from "@helper-assistant/domain";

/** The three AgentCore Memory operations used. Narrow so tests can fake them without the SDK client. */
export type AgentCoreMemoryApi = {
  createEvent(input: CreateEventInput): Promise<void>;
  listEvents(input: ListEventsInput): Promise<ListEventsOutput>;
  retrieveMemoryRecords(input: RetrieveMemoryRecordsInput): Promise<RetrieveMemoryRecordsOutput>;
};

export function agentCoreMemoryApi(client: BedrockAgentCoreClient): AgentCoreMemoryApi {
  return {
    createEvent: async (input) => {
      await client.send(new CreateEventCommand(input));
    },
    listEvents: (input) => client.send(new ListEventsCommand(input)),
    retrieveMemoryRecords: (input) => client.send(new RetrieveMemoryRecordsCommand(input)),
  };
}

export type AgentCoreMemoryConfig = {
  memoryId: string;
  /** The single actor whose sessions these are (the household). */
  actorId: string;
  /** Long-term namespaces to search, one per strategy the memory resource has. Empty = short-term only. */
  hintNamespaces: { namespace: string; strategy: MemoryStrategy }[];
};

const AGENTCORE_ROLE_BY_CHAT_ROLE: Record<ChatRoleT, RoleT> = {
  [ChatRole.USER]: Role.USER,
  [ChatRole.ASSISTANT]: Role.ASSISTANT,
};

/** AgentCore roles that are chat messages. TOOL and OTHER events are never written by us and are skipped. */
const CHAT_ROLE_BY_AGENTCORE_ROLE: Partial<Record<RoleT, ChatRoleT>> = {
  [Role.USER]: ChatRole.USER,
  [Role.ASSISTANT]: ChatRole.ASSISTANT,
};

const LIST_EVENTS_PAGE_SIZE = 100;

export class AgentCoreMemory implements MemoryClient {
  constructor(
    private readonly api: AgentCoreMemoryApi,
    private readonly config: AgentCoreMemoryConfig,
  ) {}

  /** One event per message, in order, so timestamps survive the round trip. */
  async appendChatMessages(sessionId: Id, messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      await this.api.createEvent({
        memoryId: this.config.memoryId,
        actorId: this.config.actorId,
        sessionId,
        eventTimestamp: new Date(message.at),
        payload: [{ conversational: { role: AGENTCORE_ROLE_BY_CHAT_ROLE[message.role], content: { text: message.text } } }],
      });
    }
  }

  async listChatMessages(sessionId: Id, { maxMessages }: { maxMessages: number }): Promise<ChatMessage[]> {
    const events: Event[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.api.listEvents({
        memoryId: this.config.memoryId,
        actorId: this.config.actorId,
        sessionId,
        includePayloads: true,
        maxResults: LIST_EVENTS_PAGE_SIZE,
        ...(nextToken === undefined ? {} : { nextToken }),
      });
      events.push(...(page.events ?? []));
      nextToken = page.nextToken;
    } while (nextToken !== undefined);

    return events
      .flatMap(toChatMessages)
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-maxMessages);
  }

  async retrieveHints(query: string, { topK }: { topK: number }): Promise<MemoryHint[]> {
    const perNamespace = await Promise.all(
      this.config.hintNamespaces.map(async ({ namespace, strategy }) => {
        const output = await this.api.retrieveMemoryRecords({ memoryId: this.config.memoryId, namespace, searchCriteria: { searchQuery: query, topK } });
        return (output.memoryRecordSummaries ?? []).flatMap((record): MemoryHint[] =>
          record.content?.text === undefined ? [] : [{ text: record.content.text, strategy, score: record.score ?? null }],
        );
      }),
    );
    // Unscored records sort last: a missing score is not a low score, but it isn't evidence of relevance either.
    return perNamespace
      .flat()
      .sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))
      .slice(0, topK);
  }
}

function toChatMessages(event: Event): ChatMessage[] {
  if (event.eventTimestamp === undefined) throw new Error(`AgentCore event ${event.eventId} has no timestamp`);
  const at = event.eventTimestamp.toISOString();
  return (event.payload ?? []).flatMap((item): ChatMessage[] => {
    const conversational = item.conversational;
    if (conversational === undefined || conversational.role === undefined) return [];
    const role = CHAT_ROLE_BY_AGENTCORE_ROLE[conversational.role];
    const text = conversational.content?.text;
    return role === undefined || text === undefined ? [] : [{ role, text, at }];
  });
}
