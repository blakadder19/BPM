import type { MockClass, MockBookableClass } from "@/lib/mock-data";
import type { InstanceStatus } from "@/types/domain";

export interface CreateTemplateData {
  title: string;
  classType: "class" | "social" | "student_practice";
  styleId: string | null;
  styleName: string | null;
  level: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
}

export interface TemplatePatch extends Partial<CreateTemplateData> {
  isActive?: boolean;
}

export interface CreateInstanceData {
  classId: string | null;
  title: string;
  classType: "class" | "social" | "student_practice";
  styleId: string | null;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  status: InstanceStatus;
  location: string;
}

export interface InstancePatch extends Partial<CreateInstanceData> {}

export interface IScheduleRepository {
  getTemplates(): Promise<MockClass[]>;
  getTemplate(id: string): Promise<MockClass | null>;
  createTemplate(data: CreateTemplateData): Promise<MockClass>;
  updateTemplate(id: string, patch: TemplatePatch): Promise<MockClass | null>;
  deleteTemplate(id: string): Promise<boolean>;

  getInstances(): Promise<MockBookableClass[]>;
  getInstance(id: string): Promise<MockBookableClass | null>;
  createInstance(data: CreateInstanceData): Promise<MockBookableClass>;
  updateInstance(id: string, patch: InstancePatch): Promise<MockBookableClass | null>;
  updateInstanceStatus(id: string, status: InstanceStatus): Promise<MockBookableClass | null>;
  deleteInstance(id: string): Promise<boolean>;
}
