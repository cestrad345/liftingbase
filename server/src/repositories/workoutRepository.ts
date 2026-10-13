/** Database queries and persistence for saved workout routines. */
import type { InValue, Transaction } from "@libsql/client";
import { db, getOrCreateExerciseId, placeholders } from "../db.js";
import type { WorkoutInput } from "../schemas/workoutSchema.js";

export async function fetchWorkouts(userId: number, where = "", args: InValue[] = []) {
  const workouts = await db.execute({
    sql: `SELECT w.id, w.name, w.created_at, w.updated_at,
            (SELECT MAX(s.completed_at) FROM sessions s WHERE s.workout_id = w.id AND s.user_id = w.user_id) AS last_performed_at
          FROM workouts w WHERE w.user_id = ? ${where}
          ORDER BY w.updated_at DESC`,
    args: [userId, ...args],
  });
  if (workouts.rows.length === 0) return [];

  const ids = workouts.rows.map((w) => Number(w.id));
  const exercises = await db.execute({
    sql: `SELECT we.workout_id, we.exercise_id, e.name, we.target_sets, we.target_reps
          FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
          WHERE we.workout_id IN (${placeholders(ids.length)})
          ORDER BY we.position`,
    args: ids,
  });

  return workouts.rows.map((w) => ({
    id: Number(w.id),
    name: String(w.name),
    createdAt: String(w.created_at),
    updatedAt: String(w.updated_at),
    lastPerformedAt: w.last_performed_at === null ? null : String(w.last_performed_at),
    exercises: exercises.rows
      .filter((e) => Number(e.workout_id) === Number(w.id))
      .map((e) => ({
        exerciseId: Number(e.exercise_id),
        name: String(e.name),
        targetSets: Number(e.target_sets),
        targetReps: Number(e.target_reps),
      })),
  }));
}

export async function insertExercises(tx: Transaction, workoutId: number, exercises: WorkoutInput["exercises"]) {
  for (const [position, exercise] of exercises.entries()) {
    const exerciseId = await getOrCreateExerciseId(tx, exercise.name);
    await tx.execute({
      sql: `INSERT INTO workout_exercises (workout_id, exercise_id, position, target_sets, target_reps)
            VALUES (?, ?, ?, ?, ?)`,
      args: [workoutId, exerciseId, position, exercise.targetSets, exercise.targetReps],
    });
  }
}

