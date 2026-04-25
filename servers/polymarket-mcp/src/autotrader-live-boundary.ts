export const LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION = "CONFIRM_LIVE_AUTONOMOUS_SUBMIT";

export const LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION_BLOCKER = "live_autonomous_submit_confirmation_required";

export function liveAutonomousSubmitBlockers(input: {
  mode: string;
  autoSubmit: boolean;
  confirmation?: string;
}): string[] {
  if (input.mode !== "live_autonomous" || !input.autoSubmit) {
    return [];
  }
  return input.confirmation === LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION
    ? []
    : [LIVE_AUTONOMOUS_SUBMIT_CONFIRMATION_BLOCKER];
}
