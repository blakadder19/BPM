import type { MockProduct } from "@/lib/mock-data";
import type { CreditsModel, ProductType } from "@/types/domain";

export interface CreateProductData {
  name: string;
  description: string;
  longDescription?: string | null;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  isProvisional: boolean;
  notes: string | null;
  validityDescription: string | null;
  creditsModel: CreditsModel;
  termBound?: boolean;
  recurring?: boolean;
  classesPerTerm?: number | null;
  autoRenew?: boolean;
  benefits?: string[] | null;
}

export type ProductPatch = Partial<
  Pick<
    MockProduct,
    | "name"
    | "description"
    | "longDescription"
    | "priceCents"
    | "totalCredits"
    | "durationDays"
    | "styleName"
    | "allowedLevels"
    | "isActive"
    | "isProvisional"
    | "notes"
    | "validityDescription"
    | "creditsModel"
    | "termBound"
    | "recurring"
    | "classesPerTerm"
    | "autoRenew"
    | "benefits"
  >
>;

export interface IProductRepository {
  getAll(): Promise<MockProduct[]>;
  getById(id: string): Promise<MockProduct | null>;
  create(data: CreateProductData): Promise<MockProduct>;
  update(id: string, patch: ProductPatch): Promise<MockProduct | null>;
  toggleActive(id: string): Promise<MockProduct | null>;
  delete(id: string): Promise<boolean>;
}
