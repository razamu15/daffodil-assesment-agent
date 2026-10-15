/**
 * LocalTurnRunner: the in-process TurnRunner (Doc 4 §2 seam). start() kicks off
 * runTurn and returns without waiting, like the async Lambda invoke it stands in
 * for; the UI polls the Turn. LambdaTurnRunner (I3) replaces it in AWS.
 *
 * runTurn records its own failures on the Turn. Only a failure before that
 * (the turn can't be loaded or marked RUNNING) reaches onError.
 *
 * Call sites: apps/local-server wiring, agent tests.
 */
import type { Id, TurnRunner } from "@helper-assistant/domain";
import type { AgentDeps } from "../deps";
import { runTurn } from "../loop/runTurn";

export class LocalTurnRunner implements TurnRunner {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly deps: AgentDeps,
    private readonly onError: (turn: { turnId: Id; sessionId: Id }, error: unknown) => void,
  ) {}

  async start(turn: { turnId: Id; sessionId: Id }): Promise<void> {
    const run = runTurn(turn, this.deps).then(
      () => undefined,
      (error: unknown) => this.onError(turn, error),
    );
    this.inFlight.add(run);
    void run.finally(() => this.inFlight.delete(run));
  }

  /** Resolves when every started turn has finished. For tests and graceful shutdown. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }
}
