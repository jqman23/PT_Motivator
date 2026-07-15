export type SectionJumpMode = 'health' | 'top';

export function sectionJumpMode(isMobile: boolean, scrollY: number, viewportHeight: number): SectionJumpMode {
  if (!isMobile) return 'health';
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
  return Math.max(0, scrollY) >= safeHeight * 0.9 ? 'top' : 'health';
}
