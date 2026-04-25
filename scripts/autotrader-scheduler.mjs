export function schedulerDecision(previousObservation, options, now = new Date()) {
  const observation = latestSessionObservation(previousObservation);
  const nextRunAt = observation?.nextRunAt ?? observation?.summary?.nextRunAt;
  const dueAtMs = typeof nextRunAt === "string" ? Date.parse(nextRunAt) : Number.NaN;
  const nowMs = now.getTime();
  const slackMs = Math.max(0, Number(options.schedulerSlackSeconds ?? 0)) * 1000;
  if (!options.respectNextRunAt) {
    return {
      skipped: false,
      reason: "forced",
      respectNextRunAt: false,
      previousNextRunAt: typeof nextRunAt === "string" ? nextRunAt : undefined
    };
  }
  if (!Number.isFinite(dueAtMs)) {
    return {
      skipped: false,
      reason: "missing_next_run_at",
      respectNextRunAt: true,
      previousNextRunAt: typeof nextRunAt === "string" ? nextRunAt : undefined
    };
  }
  const dueInSeconds = Math.ceil((dueAtMs - nowMs) / 1000);
  if (dueAtMs - slackMs > nowMs) {
    return {
      skipped: true,
      reason: "not_due",
      respectNextRunAt: true,
      previousNextRunAt: nextRunAt,
      dueInSeconds
    };
  }
  return {
    skipped: false,
    reason: "due",
    respectNextRunAt: true,
    previousNextRunAt: nextRunAt,
    dueInSeconds
  };
}

export function materialPaperChanges(observation) {
  observation = latestSessionObservation(observation);
  const ignored = new Set(["heartbeat_deferred_until_next_run"]);
  return (observation?.materialChanges ?? []).filter((change) => !ignored.has(change));
}

export function materialChangeFingerprint(changes = []) {
  return changes.slice().sort().join("|");
}

export function dueStatus(previousObservation, options, now = new Date()) {
  const observation = latestSessionObservation(previousObservation);
  const scheduler = schedulerDecision(observation, options, now);
  const changes = materialPaperChanges(observation);
  const changeFingerprint = materialChangeFingerprint(changes);
  const materialChangesAcknowledged = changes.length === 0 ||
    observation?.materialChangesAckFingerprint === changeFingerprint;
  const safetyIssue =
    previousObservation?.noSubmitInvariantHeld === false ||
    observation?.noSubmitInvariantHeld === false ||
    (previousObservation?.submittedOrders ?? observation?.submittedOrders ?? 0) > 0;
  const due = !scheduler.skipped;
  const shouldNotify = safetyIssue || !materialChangesAcknowledged;
  const shouldRunHeartbeat = due;
  const automationDecision = safetyIssue
    ? "notify_safety_issue"
    : shouldRunHeartbeat
      ? "run_heartbeat"
      : shouldNotify
        ? "notify_material_change"
        : "quiet";

  return {
    ok: Boolean(previousObservation),
    generatedAt: now.toISOString(),
    sessionId: observation?.sessionId ?? previousObservation?.sessionId,
    nextRunAt: scheduler.previousNextRunAt,
    scheduler,
    due,
    shouldRunHeartbeat,
    shouldNotify,
    automationDecision,
    materialPaperChanges: changes,
    materialChangeFingerprint: changeFingerprint,
    materialChangesAcknowledged,
    safetyIssue,
    noSubmitInvariantHeld: previousObservation?.noSubmitInvariantHeld ?? observation?.noSubmitInvariantHeld,
    submittedOrders: previousObservation?.submittedOrders ?? observation?.submittedOrders ?? 0,
    budgetUsdc: observation?.budgetUsdc ?? observation?.summary?.budgetUsdc,
    spentUsdc: observation?.spentUsdc ?? observation?.summary?.spentUsdc,
    remainingBudgetUsdc: observation?.remainingBudgetUsdc ?? observation?.summary?.remainingBudgetUsdc,
    positionValueUsdc: observation?.positionValueUsdc ?? observation?.summary?.positionValueUsdc,
    unrealizedPnlUsdc: observation?.unrealizedPnlUsdc ?? observation?.summary?.unrealizedPnlUsdc,
    realizedPnlUsdc: observation?.realizedPnlUsdc ?? observation?.summary?.realizedPnlUsdc,
    totalPnlUsdc: observation?.totalPnlUsdc ?? observation?.summary?.totalPnlUsdc,
    portfolioValueUsdc: observation?.portfolioValueUsdc ?? observation?.summary?.portfolioValueUsdc,
    openPositions: observation?.openPositions ?? observation?.summary?.openPositions,
    paperBuyProposalCount: observation?.paperBuyProposalCount ?? 0,
    paperExitProposalCount: observation?.paperExitProposalCount ?? 0,
    paperBuyProposals: observation?.paperBuyProposals ?? [],
    paperExitProposals: observation?.paperExitProposals ?? [],
    paperExecutionReport: observation?.paperExecutionReport,
    positionDiagnosticCount: observation?.positionDiagnosticCount ?? 0,
    positionDiagnostics: observation?.positionDiagnostics ?? []
  };
}

export function latestSessionObservation(report) {
  if (Array.isArray(report?.observations)) {
    return report.observations.find((observation) => observation?.ran) ?? report.observations[0];
  }
  return report;
}
