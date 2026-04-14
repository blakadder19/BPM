/**
 * Repository factory — returns the correct implementation based on DATA_PROVIDER.
 *
 * In "memory" mode (default): delegates to in-memory stores seeded from mock-data.
 * In "supabase" mode: delegates to Supabase-backed implementations.
 */

import { getDataProvider } from "@/lib/config/data-provider";

import type { IStudentRepository } from "./interfaces/student-repository";
import type { IProductRepository } from "./interfaces/product-repository";
import type { ITermRepository } from "./interfaces/term-repository";
import type { ISubscriptionRepository } from "./interfaces/subscription-repository";
import type { ICocRepository } from "./interfaces/coc-repository";
import type { ISettingsRepository } from "./interfaces/settings-repository";
import type { IBookingRepository } from "./interfaces/booking-repository";
import type { IAttendanceRepository } from "./interfaces/attendance-repository";
import type { IPenaltyRepository } from "./interfaces/penalty-repository";
import type { ICreditRepository } from "./interfaces/credit-repository";
import type { IStudioHireRepository } from "./interfaces/studio-hire-repository";
import type { IDanceStyleRepository } from "./interfaces/dance-style-repository";
import type { ISpecialEventRepository } from "./interfaces/special-event-repository";

import { memorySettingsRepo } from "./memory/settings-repository";
import { memoryBookingRepo } from "./memory/booking-repository";
import { memoryAttendanceRepo } from "./memory/attendance-repository";
import { memoryPenaltyRepo } from "./memory/penalty-repository";
import { memoryCreditRepo } from "./memory/credit-repository";
import { memoryStudioHireRepo } from "./memory/studio-hire-repository";

function resolveRepo<T>(memory: T, supabaseLoader: () => T): T {
  if (getDataProvider() === "supabase") return supabaseLoader();
  return memory;
}

export function getStudentRepo(): IStudentRepository {
  if (getDataProvider() === "supabase") {
    const { supabaseStudentRepo } = require("./supabase/student-repository");
    return supabaseStudentRepo;
  }
  // Memory mode: use hybrid repo so real Supabase students are visible
  // alongside mock data when Supabase is configured.
  const { hybridStudentRepo } = require("./hybrid-student-repository");
  return hybridStudentRepo;
}

export function getProductRepo(): IProductRepository {
  const { memoryProductRepo } = require("./memory/product-repository");
  return resolveRepo(memoryProductRepo, () => {
    const { supabaseProductRepo } = require("./supabase/product-repository");
    return supabaseProductRepo;
  });
}

export function getTermRepo(): ITermRepository {
  if (getDataProvider() === "supabase") {
    const { supabaseTermRepo } = require("./supabase/term-repository");
    return supabaseTermRepo;
  }
  const { hybridTermRepo } = require("./hybrid-term-repository");
  return hybridTermRepo;
}

export function getSubscriptionRepo(): ISubscriptionRepository {
  if (getDataProvider() === "supabase") {
    const { supabaseSubscriptionRepo } = require("./supabase/subscription-repository");
    return supabaseSubscriptionRepo;
  }
  const { hybridSubscriptionRepo } = require("./hybrid-subscription-repository");
  return hybridSubscriptionRepo;
}

export function getCocRepo(): ICocRepository {
  if (getDataProvider() === "supabase") {
    const { supabaseCocRepo } = require("./supabase/coc-repository");
    return supabaseCocRepo;
  }
  const { hybridCocRepo } = require("./hybrid-coc-repository");
  return hybridCocRepo;
}

export function getSettingsRepo(): ISettingsRepository {
  return resolveRepo(memorySettingsRepo, () => {
    const { supabaseSettingsRepo } = require("./supabase/settings-repository");
    return supabaseSettingsRepo;
  });
}

export function getBookingRepo(): IBookingRepository {
  return resolveRepo(memoryBookingRepo, () => {
    const { supabaseBookingRepo } = require("./supabase/booking-repository");
    return supabaseBookingRepo;
  });
}

export function getAttendanceRepo(): IAttendanceRepository {
  return resolveRepo(memoryAttendanceRepo, () => {
    const { supabaseAttendanceRepo } = require("./supabase/attendance-repository");
    return supabaseAttendanceRepo;
  });
}

export function getPenaltyRepo(): IPenaltyRepository {
  return resolveRepo(memoryPenaltyRepo, () => {
    const { supabasePenaltyRepo } = require("./supabase/penalty-repository");
    return supabasePenaltyRepo;
  });
}

export function getCreditRepo(): ICreditRepository {
  return resolveRepo(memoryCreditRepo, () => {
    const { supabaseCreditRepo } = require("./supabase/credit-repository");
    return supabaseCreditRepo;
  });
}

export function getStudioHireRepo(): IStudioHireRepository {
  return resolveRepo(memoryStudioHireRepo, () => {
    const { supabaseStudioHireRepo } = require("./supabase/studio-hire-repository");
    return supabaseStudioHireRepo;
  });
}

export function getDanceStyleRepo(): IDanceStyleRepository {
  if (getDataProvider() === "supabase") {
    const { supabaseDanceStyleRepo } = require("./supabase/dance-style-repository");
    return supabaseDanceStyleRepo;
  }
  const { memoryDanceStyleRepo } = require("./memory/dance-style-repository");
  return memoryDanceStyleRepo;
}

export function getSpecialEventRepo(): ISpecialEventRepository {
  const { memorySpecialEventRepo } = require("./memory/special-event-repository");
  return resolveRepo(memorySpecialEventRepo, () => {
    const { supabaseSpecialEventRepo } = require("./supabase/special-event-repository");
    return supabaseSpecialEventRepo;
  });
}
