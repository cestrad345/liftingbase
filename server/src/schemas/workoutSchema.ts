import { z } from "zod";
import { nameSchema } from "../http.js";

export const workoutInput = z.object({
  name: nameSchema,
  exercises: z
    .array(
      z.object({
        name: nameSchema,
        targetSets: z.number().int().min(1).max(20),
        targetReps: z.number().int().min(1).max(100),
      }),
    )
    .min(1, "Add at least one exercise")
    .max(30),
});
export type WorkoutInput = z.infer<typeof workoutInput>;

