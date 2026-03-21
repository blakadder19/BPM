import * as store from "@/lib/services/product-store";
import type { IProductRepository, CreateProductData, ProductPatch } from "../interfaces/product-repository";

export const memoryProductRepo: IProductRepository = {
  getAll: async () => store.getProducts(),
  getById: async (id) => store.getProduct(id) ?? null,
  create: async (data: CreateProductData) => store.createProduct(data),
  update: async (id, patch: ProductPatch) => store.updateProduct(id, patch),
  toggleActive: async (id) => store.toggleProductActive(id),
  delete: async (id) => store.deleteProduct(id),
};
