# AutoCatalyst subagents

These project-scoped custom agents were installed by the AutoCatalyst skill.

The generated agent files live in `.codex/agents/`.

Optional repo-local examples also live in `.codex/`, including:

- `autocatalyst-config.example.toml`
- `autocatalyst-models.example.toml`

To control subagent models per role, copy `autocatalyst-models.example.toml` to `autocatalyst-models.toml` and let the parent agent resolve that file before spawning.

## Refreshing the install

Re-run the AutoCatalyst bootstrap from the repository root after the repo moves or after you update the skill.

### Repo-local skill install

- PowerShell: `./.agents/skills/autocatalyst/scripts/autocatalyst.ps1 --root . --overwrite-subagents`
- macOS / Linux / WSL: `sh ./.agents/skills/autocatalyst/scripts/autocatalyst.sh --root . --overwrite-subagents`

### Global skill install

Run the matching wrapper or `bootstrap.py` by absolute path, but keep `--root .` pointed at this repository.
