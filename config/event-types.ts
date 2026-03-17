import type { ClassType } from "@/types/domain";
import { STUDENT_PRACTICE_IS_BOOKABLE } from "./business-rules";

interface ClassTypeConfig {
  label: string;
  bookable: boolean;
  penaltiesApply: boolean;
  creditsApply: boolean;
}

export const CLASS_TYPE_CONFIG: Record<ClassType, ClassTypeConfig> = {
  class: {
    label: "Class",
    bookable: true,
    penaltiesApply: true,
    creditsApply: true,
  },
  social: {
    label: "Social",
    bookable: false,
    penaltiesApply: false,
    creditsApply: false,
  },
  student_practice: {
    label: "Student Practice",
    bookable: STUDENT_PRACTICE_IS_BOOKABLE,
    penaltiesApply: false,
    creditsApply: false,
  },
};
