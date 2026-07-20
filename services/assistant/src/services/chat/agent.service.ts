import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { ProviderSettings } from '../provider/provider.service';
import { ForwardedAuth, TodoClient } from './todo-client';
import { ScribeClient, TiptapDoc } from './scribe-client';
import { markdownToDoc } from './markdown-to-doc';

export type AgentAction = { tool: string; detail: string };

export type AgentRunInput = {
  provider: ProviderSettings;
  auth: ForwardedAuth;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
};

export type AgentRunResult = { text: string; actions: AgentAction[] };

const DEFAULT_MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = `You are the ownTime assistant, embedded as a panel in the ownTime productivity workspace. Through your tools you can read and manage the user's todo list; you have no access to their files, email, or other apps.

When the user asks you to complete their tasks (or "the feasible ones"):
1. List the open todos first.
2. A todo is feasible for you only if you can genuinely finish it right here as knowledge work — writing, drafting, summarizing, planning, calculating, or answering from your own knowledge. A todo is NOT feasible if it requires real-world action (buying, calling, attending, exercising), access to systems you don't have, or information you cannot know.
3. For each feasible todo: do the work, present the finished result in your reply, then mark that todo done.
4. Never mark a todo done without having actually produced the work it asks for. For todos you skip, give the reason in one short line.

Saving work to Scribe (the user's notes tool). "Scribe" is the notes tool, and the user calls a single note "a scribe", "a note", or "a doc":
- Treat ALL of these as an instruction to CALL create_scribe_note (do not just reply in chat): "draft/write/make/start a scribe", "a new scribe", "a note about X", "a doc for X", "put/save this in Scribe / in a note / as a markdown file", or any request to draft a document. When the user names a topic and the word scribe/note/doc, you MUST create the note.
- The work goes IN the note, not in the chat. First produce the full content, then call create_scribe_note with a short descriptive title and that content — do not answer with the document text alone.
- Write the content as **Markdown** (headings, lists, bold/italic, code blocks, links) — it is converted to a formatted Scribe note.
- Create a new note with create_scribe_note unless the user points you at an existing one; use list_scribe_notes to find it, then append_to_scribe_note to add to it.
- After saving, tell the user the note's title; keep your chat reply brief rather than repeating the whole document.

Other guidance:
- Only delete todos when the user explicitly asks you to.
- Use your tools to check the list rather than assuming its contents.
- Lead with the outcome, then the details. Put each completed task's work under its own heading. Keep skipped-task explanations brief.`;

@Injectable()
export class AgentService {
  constructor(
    private readonly todos: TodoClient,
    private readonly scribe: ScribeClient,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const { apiKey, baseUrl, model } = input.provider;
    const client = new Anthropic({
      // Keyless local endpoints (Ollama) still require the SDK to hold *some*
      // credential string; they ignore its value.
      apiKey: apiKey ?? 'not-needed',
      baseURL: baseUrl ?? undefined,
    });
    const actions: AgentAction[] = [];

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.message },
    ];

    const final = await client.beta.messages.toolRunner({
      model: model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      // Adaptive thinking is Anthropic-specific; compatible endpoints (Ollama,
      // LiteLLM) may reject the parameter, so only send it to the hosted API.
      ...(baseUrl ? {} : { thinking: { type: 'adaptive' as const } }),
      system: SYSTEM_PROMPT,
      tools: this.buildTools(input.auth, actions),
      messages,
      max_iterations: 20,
    });

    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')
      .trim();

    return { text: text || 'I finished, but had nothing further to report.', actions };
  }

  private buildTools(auth: ForwardedAuth, actions: AgentAction[]) {
    const record = (tool: string, detail: string) => actions.push({ tool, detail });
    const fail = (error: unknown) =>
      `Error: ${error instanceof Error ? error.message : String(error)}`;

    return [
      betaTool({
        name: 'list_todos',
        description:
          "List the user's todos as JSON. Pass done=false to see only open tasks, done=true for completed ones, or omit for all.",
        inputSchema: {
          type: 'object',
          properties: {
            done: { type: 'boolean', description: 'Filter by completion state' },
          },
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            const todos = await this.todos.list(auth, args.done);
            record('list_todos', `Read ${todos.length} todo(s)`);
            return JSON.stringify(todos);
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'create_todo',
        description: 'Add a new todo to the user\'s list.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short task title (max 500 chars)' },
            notes: { type: 'string', description: 'Longer details (optional)' },
            dueAt: { type: 'string', description: 'Due date as an ISO 8601 timestamp (optional)' },
          },
          required: ['title'],
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            const todo = await this.todos.create(auth, args);
            record('create_todo', `Created "${todo.title}"`);
            return JSON.stringify(todo);
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'update_todo',
        description:
          'Update a todo by id: change its title/notes/due date, or set done=true to mark it completed (only after you have actually done the work).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Todo id from list_todos' },
            title: { type: 'string' },
            notes: { type: 'string' },
            done: { type: 'boolean' },
            dueAt: { type: ['string', 'null'], description: 'ISO 8601 timestamp, or null to clear' },
          },
          required: ['id'],
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            const { id, ...patch } = args;
            const todo = await this.todos.update(auth, id, patch);
            record(
              'update_todo',
              patch.done === true ? `Completed "${todo.title}"` : `Updated "${todo.title}"`,
            );
            return JSON.stringify(todo);
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'delete_todo',
        description:
          'Permanently delete a todo by id. Only use when the user has explicitly asked for a deletion.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Todo id from list_todos' },
          },
          required: ['id'],
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            await this.todos.delete(auth, args.id);
            record('delete_todo', `Deleted todo ${args.id}`);
            return 'Deleted.';
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'list_scribe_notes',
        description:
          "List the user's Scribe notes as JSON (id, title, updatedAt), most recently updated first. Use this to find a note to append to.",
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        } as const,
        run: async () => {
          try {
            const notes = await this.scribe.list(auth);
            record('list_scribe_notes', `Read ${notes.length} note(s)`);
            return JSON.stringify(
              notes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt })),
            );
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'create_scribe_note',
        description:
          'Create a Scribe note and fill it with Markdown content (headings, lists, bold/italic, code blocks, links are supported and rendered as a formatted note). Use this to save written work into the notes tool instead of only replying in chat.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short note title (max 200 chars)' },
            markdown: { type: 'string', description: 'The note body as Markdown' },
          },
          required: ['title', 'markdown'],
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            const note = await this.scribe.create(auth, args.title);
            await this.scribe.update(auth, note.id, { doc: markdownToDoc(args.markdown) });
            record('create_scribe_note', `Wrote note "${args.title}"`);
            return JSON.stringify({ id: note.id, title: args.title });
          } catch (error) {
            return fail(error);
          }
        },
      }),
      betaTool({
        name: 'append_to_scribe_note',
        description:
          'Append Markdown content to the end of an existing Scribe note (found via list_scribe_notes). The existing content is kept.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Note id from list_scribe_notes' },
            markdown: { type: 'string', description: 'Markdown to append to the note' },
          },
          required: ['id', 'markdown'],
          additionalProperties: false,
        } as const,
        run: async (args) => {
          try {
            const note = await this.scribe.get(auth, args.id);
            const existing = Array.isArray(note.doc?.content) ? note.doc.content : [];
            const appended = markdownToDoc(args.markdown).content;
            const doc: TiptapDoc = { type: 'doc', content: [...existing, ...appended] };
            const updated = await this.scribe.update(auth, args.id, { doc });
            record('append_to_scribe_note', `Appended to "${updated.title}"`);
            return JSON.stringify({ id: args.id, title: updated.title });
          } catch (error) {
            return fail(error);
          }
        },
      }),
    ];
  }
}
