export const ROOM_NAME_MIN = 2;
export const ROOM_NAME_MAX = 32;

export function normalizeRoomName(value) {
  return Array.from(
    String(value || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, ROOM_NAME_MAX).join('');
}

export function validRoomName(value) {
  const name = normalizeRoomName(value);
  return Array.from(name).length >= ROOM_NAME_MIN && Array.from(name).length <= ROOM_NAME_MAX;
}
