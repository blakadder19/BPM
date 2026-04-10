import "server-only";

/**
 * Request-scoped cached wrappers for the most frequently-repeated
 * repository calls. Uses React.cache() so that multiple calls within
 * the same HTTP request / render tree are deduplicated — the actual
 * DB query runs at most once per request.
 *
 * These are safe because the underlying data does not change mid-request.
 */

import { cache } from "react";
import {
  getTermRepo,
  getProductRepo,
  getCocRepo,
  getStudentRepo,
  getSubscriptionRepo,
  getDanceStyleRepo,
} from "@/lib/repositories";
import { getNotificationsForStudent as _getNotificationsFromDB } from "@/lib/communications/notification-store";

export const cachedGetTerms = cache(() => getTermRepo().getAll());

export const cachedGetProducts = cache(() => getProductRepo().getAll());

export const cachedCocCheck = cache((studentId: string, version: string) =>
  getCocRepo().hasAcceptedVersion(studentId, version)
);

export const cachedGetStudentById = cache((id: string) =>
  getStudentRepo().getById(id)
);

export const cachedGetStudentSubs = cache((id: string) =>
  getSubscriptionRepo().getByStudent(id)
);

export const cachedGetNotifications = cache((studentId: string) =>
  _getNotificationsFromDB(studentId)
);

export const cachedGetAllStudents = cache(() => getStudentRepo().getAll());
export const cachedGetAllSubs = cache(() => getSubscriptionRepo().getAll());
export const cachedGetAllDanceStyles = cache(() => getDanceStyleRepo().getAll());
