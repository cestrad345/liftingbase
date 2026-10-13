import { currentUser } from "../auth.js";
import { Router } from "express";
import { z } from "zod";
import { db, getOrCreateExerciseId } from "../db.js";
import { HttpError, nameSchema, parseId } from "../http.js";
import { fetchSessions } from "../repositories/sessionRepository.js";

const router = Router();

const sessionInput = z
  .object({
    workoutId: z.number().int().positive().nullable().optional(),
    name: nameSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    exercises: z
      .array(
        z.object({
          name: nameSchema,
          sets: z
            .array(
              z.object({
                reps: z.number().int().min(0).max(1000),
                weight: z.number().min(0).max(5000),
              }),
            )
            .min(1),
        }),
      )
      .min(1, "Log at least one set"),
  })
  .refine((s) => s.startedAt <= s.completedAt, "startedAt must be before completedAt");

router.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  res.json(await fetchSessions(currentUser(req).id, "", [], limit));
});

router.get("/count", async (req, res) => {
  const since = z.string().datetime().parse(req.query.since);
  const result = await db.execute({
    sql: "SELECT COUNT(*) AS count FROM sessions WHERE completed_at >= ? AND user_id = ?",
    args: [since, currentUser(req).id],
  });
  res.json({ count: Number(result.rows[0].count) });
});

router.get("/:id", async (req, res) => {
  const [session] = await fetchSessions(currentUser(req).id, "AND id = ?", [parseId(req.params.id)], 1);
  if (!session) throw new HttpError(404, "Workout not found");
  res.json(session);
});

router.post("/", async (req, res) => {
  const input = sessionInput.parse(req.body);
  const tx = await db.transaction("write");
  let id: number;
  try {
    let workoutId = input.workoutId ?? null;
    if (workoutId !== null) {
      const exists = await tx.execute({ sql: "SELECT 1 FROM workouts WHERE id = ? AND user_id = ?", args: [workoutId, currentUser(req).id] });
      if (exists.rows.length === 0) workoutId = null;
    }
    const result = await tx.execute({
      sql: "INSERT INTO sessions (workout_id, name, started_at, completed_at, user_id) VALUES (?, ?, ?, ?, ?)",
      args: [workoutId, input.name, input.startedAt, input.completedAt, currentUser(req).id],
    });
    id = Number(result.lastInsertRowid);
    for (const [order, exercise] of input.exercises.entries()) {
      const exerciseId = await getOrCreateExerciseId(tx, exercise.name);
      for (const [index, set] of exercise.sets.entries()) {
        await tx.execute({
          sql: `INSERT INTO session_sets (session_id, exercise_id, exercise_order, set_number, reps, weight)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [id, exerciseId, order, index + 1, set.reps, set.weight],
        });
      }
    }
    await tx.commit();
  } finally {
    tx.close();
  }
  const [session] = await fetchSessions(currentUser(req).id, "AND id = ?", [id], 1);
  res.status(201).json(session);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const owned = await db.execute({ sql: "SELECT id FROM sessions WHERE id = ? AND user_id = ?", args: [id, currentUser(req).id] });
  if (!owned.rows.length) throw new HttpError(404, "Workout not found");
  const results = await db.batch(
    [
      { sql: "DELETE FROM session_sets WHERE session_id = ?", args: [id] },
      { sql: "DELETE FROM sessions WHERE id = ?", args: [id] },
    ],
    "write",
  );
  if (results[1].rowsAffected === 0) throw new HttpError(404, "Workout not found");
  res.status(204).end();
});

export default router;
