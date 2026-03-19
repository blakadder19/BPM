import type { CocAcceptance } from "@/lib/services/coc-store";

export interface ICocRepository {
  getAcceptance(studentId: string): Promise<CocAcceptance | null>;
  hasAcceptedVersion(studentId: string, version: string): Promise<boolean>;
  accept(studentId: string, version: string): Promise<CocAcceptance>;
  revoke(studentId: string): Promise<boolean>;
}
