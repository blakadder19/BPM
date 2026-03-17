import { describe, it, expect } from "vitest";
import { canAccessClass, type AccessClassContext } from "../product-access";
import type { ProductAccessRule } from "@/config/product-access";

const bachataClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-1",
  level: "Beginner 1",
};

const cubanClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-4",
  level: "Beginner 1",
};

const salsaClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-5",
  level: "Beginner 2",
};

const socialEvent: AccessClassContext = {
  classType: "social",
  danceStyleId: null,
  level: null,
};

const intermediateClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-1",
  level: "Intermediate",
};

function makeRule(overrides: Partial<ProductAccessRule> = {}): ProductAccessRule {
  return {
    productId: "test-product",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
    ...overrides,
  };
}

describe("canAccessClass", () => {
  describe("all styles access", () => {
    const rule = makeRule({ styleAccess: { type: "all" } });

    it("grants access to any class", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(true);
      expect(canAccessClass(rule, null, null, cubanClass).granted).toBe(true);
    });

    it("denies access to social when classType not allowed", () => {
      expect(canAccessClass(rule, null, null, socialEvent).granted).toBe(false);
    });

    it("grants access to social when classType is allowed", () => {
      const socialRule = makeRule({
        allowedClassTypes: ["class", "social"],
        styleAccess: { type: "all" },
      });
      expect(canAccessClass(socialRule, null, null, socialEvent).granted).toBe(true);
    });
  });

  describe("fixed styles access", () => {
    const rule = makeRule({
      styleAccess: { type: "fixed", styleIds: ["ds-1", "ds-4"] },
    });

    it("grants access when class style is in the fixed list", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(true);
      expect(canAccessClass(rule, null, null, cubanClass).granted).toBe(true);
    });

    it("denies access when class style is NOT in the fixed list", () => {
      expect(canAccessClass(rule, null, null, salsaClass).granted).toBe(false);
    });

    it("denies access when class has no style", () => {
      const noStyleClass: AccessClassContext = { classType: "class", danceStyleId: null, level: null };
      expect(canAccessClass(rule, null, null, noStyleClass).granted).toBe(false);
    });

    it("denies when fixed list is empty (e.g. Yoga with no styles yet)", () => {
      const emptyRule = makeRule({
        styleAccess: { type: "fixed", styleIds: [] },
      });
      expect(canAccessClass(emptyRule, null, null, bachataClass).granted).toBe(false);
    });
  });

  describe("selected_style access", () => {
    const rule = makeRule({
      styleAccess: { type: "selected_style" },
      allowedLevels: ["Beginner 1", "Beginner 2"],
    });

    it("grants when class style matches selected style", () => {
      expect(canAccessClass(rule, "ds-1", null, bachataClass).granted).toBe(true);
    });

    it("denies when class style does not match selected style", () => {
      expect(canAccessClass(rule, "ds-4", null, bachataClass).granted).toBe(false);
    });

    it("denies when no style was selected", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(false);
    });

    it("denies when class level is outside allowed levels", () => {
      expect(canAccessClass(rule, "ds-1", null, intermediateClass).granted).toBe(false);
    });

    it("grants when class level is in allowed levels", () => {
      const beg2Class: AccessClassContext = { classType: "class", danceStyleId: "ds-1", level: "Beginner 2" };
      expect(canAccessClass(rule, "ds-1", null, beg2Class).granted).toBe(true);
    });
  });

  describe("course_group access", () => {
    const rule = makeRule({
      styleAccess: {
        type: "course_group",
        poolStyleIds: ["ds-1", "ds-4", "ds-5"],
        pickCount: 2,
      },
      allowedLevels: ["Beginner 1"],
    });

    it("grants when class style is in the student's selected styles", () => {
      const selectedIds = ["ds-1", "ds-5"];
      expect(canAccessClass(rule, null, selectedIds, bachataClass).granted).toBe(true);
    });

    it("denies when class style is NOT in the student's selected styles", () => {
      const selectedIds = ["ds-1", "ds-5"];
      expect(canAccessClass(rule, null, selectedIds, cubanClass).granted).toBe(false);
    });

    it("denies when no styles were selected", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(false);
      expect(canAccessClass(rule, null, [], bachataClass).granted).toBe(false);
    });

    it("denies when class level is outside allowed levels", () => {
      const selectedIds = ["ds-1", "ds-5"];
      expect(canAccessClass(rule, null, selectedIds, salsaClass).granted).toBe(false);
    });
  });

  describe("social_only access", () => {
    const rule = makeRule({
      allowedClassTypes: ["social"],
      styleAccess: { type: "social_only" },
    });

    it("grants for social class type", () => {
      expect(canAccessClass(rule, null, null, socialEvent).granted).toBe(true);
    });

    it("denies for regular class type", () => {
      const classRule = makeRule({
        allowedClassTypes: ["class", "social"],
        styleAccess: { type: "social_only" },
      });
      expect(canAccessClass(classRule, null, null, bachataClass).granted).toBe(false);
    });
  });

  describe("level restrictions", () => {
    const rule = makeRule({
      allowedLevels: ["Beginner 1"],
    });

    it("grants when class level is allowed", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(true);
    });

    it("denies when class level is not allowed", () => {
      expect(canAccessClass(rule, null, null, intermediateClass).granted).toBe(false);
    });

    it("grants when class has no level (e.g. Open)", () => {
      const openClass: AccessClassContext = { classType: "class", danceStyleId: "ds-6", level: null };
      expect(canAccessClass(rule, null, null, openClass).granted).toBe(true);
    });

    it("grants when product has no level restrictions", () => {
      const noLevelRule = makeRule({ allowedLevels: null });
      expect(canAccessClass(noLevelRule, null, null, intermediateClass).granted).toBe(true);
    });
  });

  describe("reason messages", () => {
    it("returns class type reason when class type is excluded", () => {
      const rule = makeRule({ allowedClassTypes: ["class"] });
      const result = canAccessClass(rule, null, null, socialEvent);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain("class type");
    });

    it("returns style reason when style doesn't match", () => {
      const rule = makeRule({ styleAccess: { type: "selected_style" } });
      const result = canAccessClass(rule, "ds-99", null, bachataClass);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain("style");
    });

    it("returns level reason when level doesn't match", () => {
      const rule = makeRule({ allowedLevels: ["Beginner 1"] });
      const result = canAccessClass(rule, null, null, intermediateClass);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain("level");
    });
  });
});
