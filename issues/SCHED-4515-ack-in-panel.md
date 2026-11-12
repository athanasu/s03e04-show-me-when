---
id: SCHED-4515
title: Ack moves from the row to an incident panel
status: ready
plan: R2
---

Product's decision on the step-one report (build 47b267a, recording at 00:14): a new incident moved the rows
while on-call aimed at Ack of INC-4114, and the click acked INC-8143.

> New incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and Ack lives there.

- Remove the Ack button (`data-testid="ack"`) from the rows.
- A click on a row (or its id button, for the keyboard) opens the incident panel
  (`data-testid="incident-panel"`). The panel names the incident id and keeps that incident while rows move.
- Ack in the panel (`data-testid="panel-ack"`) calls `api.ack(id)` for the incident the panel names and marks
  that incident's row acked (`data-testid="acked"`).
- R1 and R4 do not change: new incidents still appear live at the top.

Acceptance: on-call aims at a row, a new incident arrives, the click opens the panel of the row above; the
panel says so by id; on-call picks their row again and acks the incident they meant.
