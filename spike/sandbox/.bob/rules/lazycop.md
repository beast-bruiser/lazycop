# LazyCop (spike)

A developer follows your work live in LazyCop.

- Before every file edit, call the `lazycop` MCP tool `declare_step` with one sentence of intent, the main
  assumption the edit relies on, and the files. Set `important: true` for a new dependency, a schema or public
  API change, or deleting code.
- If a tool result contains "Message from the developer (via LazyCop)", or `declare_step` returns developer
  messages, address them before anything else and answer with `reply_to_developer`.
- If told the developer is reviewing a decision, call `check_in` (it waits for them) and keep calling it while it says HOLD. Never end your turn while on hold.
