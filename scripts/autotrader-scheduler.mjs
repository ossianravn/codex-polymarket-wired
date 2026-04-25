export function schedulerDecision(previousObservation, options, now = new Date()) {
  const nextRunAt = previousObservation?.nextRunAt ?? previousObservation?.summary?.nextRunAt;
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
  const ignored = new Set(["heartbeat_deferred_until_next_run"]);
  return (observation?.materialChanges ?? []).filter((change) => !ignored.has(change));
}

export function dueStatus(previousObservation, options, now = new Date()) {
  const scheduler = schedulerDecision(previousObservation, options, now);
  const changes = materialPaperChanges(previousObservation);
  const safetyIssue =
    previousObservation?.noSubmitInvariantHeld === false ||
    (previousObservation?.submittedOrders ?? 0) > 0;
  const due = !scheduler.skipped;
  const shouldNotify = safetyIssue || changes.length > 0;
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
    sessionId: previousObservation?.sessionId,
    nextRunAt: scheduler.previousNextRunAt,
    scheduler,
    due,
    shouldRunHeartbeat,
    shouldNotify,
    automationDecision,
    materialPaperChanges: changes,
    safetyIssue,
    noSubmitInvariantHeld: previousObservation?.noSubmitInvariantHeld,
    submittedOrders: previousObservation?.submittedOrders ?? 0
  };
}
