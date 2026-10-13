/** Read-model for completed, user-owned workout sessions. */
import type { InValue } from "@libsql/client";
import { db, placeholders } from "../db.js";

export async function fetchSessions(userId: number, where: string, args: InValue[], limit: number) {
  const sessions = await db.execute({
    sql: `SELECT id, workout_id, name, started_at, completed_at FROM sessions WHERE user_id = ? ${where}
          ORDER BY completed_at DESC LIMIT ?`,
    args: [userId, ...args, limit],
  });
  if (sessions.rows.length === 0) return [];

  const ids = sessions.rows.map((s) => Number(s.id));
  const sets = await db.execute({
    sql: `SELECT ss.session_id, ss.exercise_id, ss.exercise_order, e.name, ss.set_number, ss.reps, ss.weight
          FROM session_sets ss JOIN exercises e ON e.id = ss.exercise_id
          WHERE ss.session_id IN (${placeholders(ids.length)})
          ORDER BY ss.session_id, ss.exercise_order, ss.set_number`,
    args: ids,
  });

  return sessions.rows.map((s) => {
    const exercises: { order: number; exerciseId: number; name: string; sets: { setNumber: number; reps: number; weight: number }[] }[] = [];
    for (const row of sets.rows) {
      if (Number(row.session_id) !== Number(s.id)) continue;
      let exercise = exercises.at(-1);
      if (!exercise || exercise.order !== Number(row.exercise_order)) {
        exercise = { order: Number(row.exercise_order), exerciseId: Number(row.exercise_id), name: String(row.name), sets: [] };
        exercises.push(exercise);
      }
      exercise.sets.push({ setNumber: Number(row.set_number), reps: Number(row.reps), weight: Number(row.weight) });
    }
    return {
      id: Number(s.id),
      workoutId: s.workout_id === null ? null : Number(s.workout_id),
      name: String(s.name),
      startedAt: String(s.started_at),
      completedAt: String(s.completed_at),
      exercises: exercises.map(({ order: _order, ...exercise }) => exercise),
    };
  });
}

