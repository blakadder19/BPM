/**
 * Code of Conduct acceptance store — tracks which students have accepted
 * which version. Uses globalThis singleton pattern for HMR resilience.
 */

export interface CocAcceptance {
  studentId: string;
  acceptedVersion: string;
  acceptedAt: string;
}

const g = globalThis as unknown as {
  __bpm_cocAcceptances?: CocAcceptance[];
};

function init(): CocAcceptance[] {
  if (!g.__bpm_cocAcceptances) {
    g.__bpm_cocAcceptances = [
      { studentId: "s-01", acceptedVersion: "1.0", acceptedAt: "2026-01-20T10:00:00Z" },
      { studentId: "s-02", acceptedVersion: "1.0", acceptedAt: "2026-02-01T14:30:00Z" },
      { studentId: "s-06", acceptedVersion: "1.0", acceptedAt: "2026-01-25T09:15:00Z" },
    ];
  }
  return g.__bpm_cocAcceptances;
}

export function getCocAcceptances(): CocAcceptance[] {
  return init();
}

export function getCocAcceptance(studentId: string): CocAcceptance | undefined {
  return init().find((a) => a.studentId === studentId);
}

export function hasAcceptedCurrentVersion(studentId: string, currentVersion: string): boolean {
  const acceptance = getCocAcceptance(studentId);
  return acceptance !== undefined && acceptance.acceptedVersion === currentVersion;
}

export function acceptCoc(studentId: string, version: string): CocAcceptance {
  const acceptances = init();
  const existing = acceptances.find((a) => a.studentId === studentId);
  const record: CocAcceptance = {
    studentId,
    acceptedVersion: version,
    acceptedAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  acceptances.push(record);
  return record;
}

export function revokeAcceptance(studentId: string): boolean {
  const acceptances = init();
  const idx = acceptances.findIndex((a) => a.studentId === studentId);
  if (idx === -1) return false;
  acceptances.splice(idx, 1);
  return true;
}
