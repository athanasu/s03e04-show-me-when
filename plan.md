# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board; its row opens the incident panel, which names the incident; on-call acks it there — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** *(changed 2026-11-12, product, SCHED-4515)* A row has no Ack button. A row opens its **incident panel**. The panel names the incident by id and stays on that incident while rows move. **Ack** lives in the panel: it sends the ack (`api.ack(id)`) for the incident the panel names and marks that incident's row acked.
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `incident-panel` | the incident panel, naming the incident id (added by SCHED-4515) |
| `panel-ack` | the Ack button in the panel (added by SCHED-4515) |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |

`ack` (the Ack button in a row) was removed by SCHED-4515: rows hold no Ack.

## Decisions

- **2026-11-12 · product · SCHED-4515.** Evidence: build 47b267a, recording at 00:14 — the pointer rested on Ack of
  INC-4114, a new incident arrived (R1, R4), the rows moved down, and the click acked INC-8143. Decision: "New
  incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and Ack lives there."
  R1 and R4 are unchanged.

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
