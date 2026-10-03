export interface ExerciseDescriptorJSON {
  version: 2;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /**
   * Every muscle, primary first: the shape app versions before the split read. Written so a rolled-back
   * update or an older phone restoring a backup still reads new rows; never read. Drop it once every install
   * has moved past the split.
   */
  muscles?: string[];
  instructions: string;
  category: string;
}
