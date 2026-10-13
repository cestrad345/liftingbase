import { currentUser } from "../auth.js";
import { Router } from "express";
import { db, placeholders } from "../db.js";
import { fetchWorkouts, insertExercises } from "../repositories/workoutRepository.js";
import { workoutInput } from "../schemas/workoutSchema.js";
import { HttpError, parseId } from "../http.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await fetchWorkouts(currentUser(_req).id));
});

// Includes the sets from the last time each exercise was logged, to prefill the active workout.
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [workout] = await fetchWorkouts(currentUser(req).id, "AND w.id = ?", [id]);
  if (!workout) throw new HttpError(404, "Workout not found");

  const exerciseIds = [...new Set(workout.exercises.map((e) => e.exerciseId))];
  const lastSets = await db.execute({
    sql: `SELECT ss.exercise_id, ss.reps, ss.weight, s.completed_at
          FROM session_sets ss JOIN sessions s ON s.id = ss.session_id
          WHERE ss.exercise_id IN (${placeholders(exerciseIds.length)}) AND s.user_id = ?
            AND ss.session_id = (
              SELECT ss2.session_id FROM session_sets ss2 JOIN sessions s2 ON s2.id = ss2.session_id
              WHERE ss2.exercise_id = ss.exercise_id AND s2.user_id = ?
              ORDER BY s2.completed_at DESC LIMIT 1)
          ORDER BY ss.exercise_order, ss.set_number`,
    args: [...exerciseIds, currentUser(req).id, currentUser(req).id],
  });

  res.json({
    ...workout,
    exercises: workout.exercises.map((e) => {
      const rows = lastSets.rows.filter((r) => Number(r.exercise_id) === e.exerciseId);
      return {
        ...e,
        lastDate: rows.length ? String(rows[0].completed_at) : null,
        lastSets: rows.map((r) => ({ reps: Number(r.reps), weight: Number(r.weight) })),
      };
    }),
  });
});

router.post("/", async (req, res) => {
  const input = workoutInput.parse(req.body);
  const now = new Date().toISOString();
  const tx = await db.transaction("write");
  let id: number;
  try {
    const result = await tx.execute({
      sql: "INSERT INTO workouts (name, created_at, updated_at, user_id) VALUES (?, ?, ?, ?)",
      args: [input.name, now, now, currentUser(req).id],
    });
    id = Number(result.lastInsertRowid);
    await insertExercises(tx, id, input.exercises);
    await tx.commit();
  } finally {
    tx.close();
  }
  const [workout] = await fetchWorkouts(currentUser(req).id, "AND w.id = ?", [id]);
  res.status(201).json(workout);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const input = workoutInput.parse(req.body);
  const tx = await db.transaction("write");
  try {
    const result = await tx.execute({
      sql: "UPDATE workouts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      args: [input.name, new Date().toISOString(), id, currentUser(req).id],
    });
    if (result.rowsAffected === 0) throw new HttpError(404, "Workout not found");
    await tx.execute({ sql: "DELETE FROM workout_exercises WHERE workout_id = ?", args: [id] });
    await insertExercises(tx, id, input.exercises);
    await tx.commit();
  } finally {
    tx.close();
  }
  const [workout] = await fetchWorkouts(currentUser(req).id, "AND w.id = ?", [id]);
  res.json(workout);
});

// Deleting a routine keeps its logged sessions in history; they just stop pointing at it.
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const owned = await db.execute({ sql: "SELECT id FROM workouts WHERE id = ? AND user_id = ?", args: [id, currentUser(req).id] });
  if (!owned.rows.length) throw new HttpError(404, "Workout not found");
  const results = await db.batch(
    [
      { sql: "UPDATE sessions SET workout_id = NULL WHERE workout_id = ?", args: [id] },
      { sql: "DELETE FROM workout_exercises WHERE workout_id = ?", args: [id] },
      { sql: "DELETE FROM workouts WHERE id = ?", args: [id] },
    ],
    "write",
  );
  if (results[2].rowsAffected === 0) throw new HttpError(404, "Workout not found");
  res.status(204).end();
});

export default router;
