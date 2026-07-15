export function isDirectBackdropInteraction(target: EventTarget | null, currentTarget: EventTarget | null) {
  return target !== null && target === currentTarget;
}
