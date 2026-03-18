import {
  getProducts as mockGetAll,
  createProduct as mockCreate,
  updateProduct as mockUpdate,
  toggleProductActive as mockToggle,
} from "@/lib/services/product-store";
import type { MockProduct } from "@/lib/mock-data";
import type { CreditsModel, ProductType } from "@/types/domain";

const isDev = process.env.NODE_ENV === "development";

export async function getProducts(): Promise<MockProduct[]> {
  if (isDev) return mockGetAll();

  // PROVISIONAL: production reads from products table
  return [];
}

export async function createProduct(data: {
  name: string;
  description: string;
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
}): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    mockCreate(data);
    return { success: true };
  }

  return { success: false, error: "Production product creation not yet implemented" };
}

export async function updateProduct(
  id: string,
  patch: {
    name?: string;
    description?: string;
    productType?: ProductType;
    priceCents?: number;
    totalCredits?: number | null;
    durationDays?: number | null;
    styleName?: string | null;
    allowedLevels?: string[] | null;
    isActive?: boolean;
    isProvisional?: boolean;
    notes?: string | null;
    validityDescription?: string | null;
    creditsModel?: CreditsModel;
  }
): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    const result = mockUpdate(id, patch);
    return result
      ? { success: true }
      : { success: false, error: "Product not found" };
  }

  return { success: false, error: "Production product update not yet implemented" };
}

export async function toggleProductActive(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (isDev) {
    const result = mockToggle(id);
    return result
      ? { success: true }
      : { success: false, error: "Product not found" };
  }

  return { success: false, error: "Production toggle not yet implemented" };
}
